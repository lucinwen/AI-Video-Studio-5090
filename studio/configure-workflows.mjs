import { readFile, writeFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const target = new URL('./workflows.local.json', import.meta.url);
const optionNames = new Set(['--text', '--image', '--still']);

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const stillShape = new Map([
  ['CheckpointLoaderSimple', [1, ['ckpt_name']]],
  ['CLIPTextEncode', [2, ['text', 'clip']]],
  ['EmptyLatentImage', [1, ['width', 'height', 'batch_size']]],
  ['KSampler', [1, ['model', 'seed', 'steps', 'cfg', 'sampler_name', 'scheduler', 'positive', 'negative', 'latent_image', 'denoise']]],
  ['VAEDecode', [1, ['samples', 'vae']]],
  ['SaveImage', [1, ['images', 'filename_prefix']]]
]);
const isSafeCheckpoint = name =>
  typeof name === 'string' && name.length <= 240 && /\.safetensors$/i.test(name) &&
  name.split(/[/\\]/).every(segment =>
    segment && segment !== '.' && segment !== '..' && !/[<>:"|?*\u0000-\u001f\u007f]/.test(segment) &&
    !/[ .]$/.test(segment) && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(segment)
  );
const isIntIn = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const isFloatIn = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const isSamplerOption = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value);
const at = (edge, id, index) =>
  Array.isArray(edge) && edge.length === 2 && edge[0] === id && edge[1] === index;

function stillProfileFromGraph(graph) {
  const fail = problem => { throw new Error('文生图 API 图不符合 Studio 内置路径：' + problem); };
  const grouped = new Map();
  for (const [id, node] of Object.entries(graph)) {
    const shape = stillShape.get(node.class_type);
    if (!shape) fail('仅支持文档列出的 ComfyUI 内置节点，不运行自定义节点。');
    const [, allowed] = shape;
    const inputs = node.inputs;
    if (Object.keys(inputs).length !== allowed.length || !allowed.every(k => Object.hasOwn(inputs, k))) {
      fail('节点必须使用标准 API 输入：' + node.class_type + '。');
    }
    const ids = grouped.get(node.class_type) ?? [];
    ids.push(id);
    grouped.set(node.class_type, ids);
  }
  for (const [type, [count]] of stillShape) {
    if (grouped.get(type)?.length !== count) fail(type + ' 数量错误。');
  }
  const [checkpoint] = grouped.get('CheckpointLoaderSimple');
  const [latent] = grouped.get('EmptyLatentImage');
  const [sampler] = grouped.get('KSampler');
  const [decode] = grouped.get('VAEDecode');
  const [save] = grouped.get('SaveImage');
  const encoders = grouped.get('CLIPTextEncode');
  const s = graph[sampler].inputs;
  const d = graph[decode].inputs;
  const l = graph[latent].inputs;
  const out = graph[save].inputs;
  const pos = s.positive?.[0], neg = s.negative?.[0];
  if (!encoders.includes(pos) || !encoders.includes(neg) || pos === neg ||
      !at(s.positive, pos, 0) || !at(s.negative, neg, 0) ||
      !at(s.model, checkpoint, 0) || !at(s.latent_image, latent, 0) ||
      !at(d.samples, sampler, 0) || !at(d.vae, checkpoint, 2) ||
      !at(out.images, decode, 0)) {
    fail('请保持 Checkpoint → KSampler → VAEDecode → SaveImage，并将正、负提示词分别接到 KSampler。');
  }
  for (const id of encoders) {
    const {text, clip} = graph[id].inputs;
    if (!at(clip, checkpoint, 1) || typeof text !== 'string' || text.length > 100_000) {
      fail('正、负提示词必须是文字，且使用同一 Checkpoint 的 CLIP 输出。');
    }
  }
  if (!isSafeCheckpoint(graph[checkpoint].inputs.ckpt_name)) {
    fail('请选择已安装的相对路径 .safetensors 权重，不接受绝对路径或上级目录。');
  }
  if (l.batch_size !== 1 || ![l.width, l.height].every(n => isIntIn(n, 64, 2048) && n % 8 === 0)) {
    fail('批量张数需为 1，宽高需在 64–2048 之间且是 8 的倍数。');
  }
  if (!isIntIn(s.seed, 0, Number.MAX_SAFE_INTEGER) || !isIntIn(s.steps, 1, 100) ||
      !isFloatIn(s.cfg, 0, 30) || !isFloatIn(s.denoise, 0, 1) ||
      !isSamplerOption(s.sampler_name) || !isSamplerOption(s.scheduler)) {
    fail('请核对 KSampler 的 seed、steps、cfg、denoise、采样器和调度器字段。');
  }
  if (typeof out.filename_prefix !== 'string') fail('SaveImage 文件前缀必须是文字。');
  // Rebuild with declared inputs only; no workflow metadata or export-controlled filesystem output.
  const clean = Object.fromEntries(Object.entries(graph).map(([id, node]) =>
    [id, {class_type: node.class_type, inputs: structuredClone(node.inputs)}]));
  clean[save].inputs.filename_prefix = 'StudioStill';
  return {graph: clean, prompt: {node: pos, input: 'text'}, seed: {node: sampler, input: 'seed'}, outputNode: save};
}

function hasInputs(node, type, names) {
  return node?.class_type === type && names.every(name => Object.hasOwn(node.inputs ?? {}, name));
}

export function profileFromExport(payload, mode) {
  if (!['text', 'image', 'still'].includes(mode)) throw new Error('未知的工作流类型。');
  // Standard Save (API Format) output is the raw graph. Also accept the documented /prompt envelope.
  const graph = payload?.prompt ?? payload;
  if (!record(graph) || Array.isArray(graph.nodes)) {
    throw new Error('请选择「Save (API Format)」导出的 JSON。普通画布工作流不能直接提交。');
  }
  for (const [id, node] of Object.entries(graph)) {
    if (!/^\d+$/.test(id) || typeof node?.class_type !== 'string' ||
      !record(node.inputs)) {
      throw new Error('API 图应包含样式为数字 ID、class_type、inputs 的节点。');
    }
  }
  if (mode === 'still') return stillProfileFromGraph(graph);
  if (!hasInputs(graph['6'], 'CLIPTextEncode', ['text']) ||
      !hasInputs(graph['55'], 'Wan22ImageToVideoLatent', ['vae']) ||
      !hasInputs(graph['58'], 'SaveVideo', ['video'])) {
    throw new Error('节点与配套 Wan 2.2 5B 模板不符：需要 6（提示词）、55（视频潜变量）和 58（SaveVideo）。');
  }
  const input = graph['55'].inputs.start_image;
  if (mode === 'image' && (!hasInputs(graph['56'], 'LoadImage', ['image']) ||
        !Array.isArray(input) || input[0] !== '56' || input[1] !== 0)) {
    throw new Error('图生视频导出时需要启用参考图节点 56，并保留它到节点 55 的 start_image 连线。');
  }
  if (mode === 'text' && input != null) {
    throw new Error('文生视频导出时请停用参考图节点，节点 55 不应包含 start_image。');
  }
  const sampler = graph['3'];
  const seed = sampler?.inputs?.seed;
  const canBindSeed = hasInputs(sampler, 'KSampler', ['seed']) && Number.isSafeInteger(seed) && seed >= 0;
  return {
    graph,
    prompt: { node: '6', input: 'text' },
    ...(mode === 'image' ? { image: { node: '56', input: 'image' } } : {}),
    ...(canBindSeed ? { seed: { node: '3', input: 'seed' } } : {}),
    outputNode: '58'
  };
}

async function main(args) {
  if (!args.length || args.includes('--help')) {
    console.log('用法：node studio/configure-workflows.mjs --text 文生视频_api.json --image 图生视频_api.json --still 文生图_api.json');
    console.log('可只传一种；只创建 studio/workflows.local.json，不覆盖已有配置。');
    return;
  }
  const profiles = {};
  for (let i = 0; i < args.length; i += 2) {
    const [flag, file] = args.slice(i, i + 2);
    if (!optionNames.has(flag) || !file || file.startsWith('--')) throw new Error('请使用 --text、--image 或 --still 加本机 API 图路径。');
    const mode = flag.slice(2);
    if (Object.hasOwn(profiles, mode)) throw new Error('每种模式只能配置一份 API 图。');
    const input = await stat(file);
    if (!input.isFile() || input.size > 1024 * 1024) throw new Error('API 图必须是 1 MiB 以下的本机文件。');
    const json = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
    profiles[mode] = profileFromExport(json, mode);
    if (!profiles[mode].seed) {
      console.warn(`${mode} 工作流未启用固定种子：需要节点 3 为 KSampler，且 seed 是非负安全整数。普通生成不受此配置项限制。`);
    }
  }
  try {
    await writeFile(target, JSON.stringify(profiles, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('已有 workflows.local.json。备份并从原位置移走以后才能生成新版。');
    throw error;
  }
  console.log('已在本机创建 studio/workflows.local.json。未启动 ComfyUI，也未验证真实生成。');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    console.error('无法配置：' + error.message);
    process.exitCode = 1;
  });
}
