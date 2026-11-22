import { readFile, writeFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const target = new URL('./workflows.local.json', import.meta.url);
const optionNames = new Set(['--text', '--image']);

function hasInputs(node, type, names) {
  return node?.class_type === type && names.every(name => Object.hasOwn(node.inputs ?? {}, name));
}

export function profileFromExport(payload, mode) {
  if (!['text', 'image'].includes(mode)) throw new Error('未知的工作流类型。');
  // Standard Save (API Format) output is the raw graph. Also accept the documented /prompt envelope.
  const graph = payload?.prompt ?? payload;
  if (!graph || typeof graph !== 'object' || Array.isArray(graph) || Array.isArray(graph.nodes)) {
    throw new Error('请选择「Save (API Format)」导出的 JSON。普通画布工作流不能直接提交。');
  }
  for (const [id, node] of Object.entries(graph)) {
    if (!/^\d+$/.test(id) || typeof node?.class_type !== 'string' ||
      !node.inputs || Array.isArray(node.inputs) || typeof node.inputs !== 'object') {
      throw new Error('API 图应包含样式为数字 ID、class_type、inputs 的节点。');
    }
  }
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
  return {
    graph,
    prompt: { node: '6', input: 'text' },
    ...(mode === 'image' ? { image: { node: '56', input: 'image' } } : {}),
    outputNode: '58'
  };
}

async function main(args) {
  if (!args.length || args.includes('--help')) {
    console.log('用法：node studio/configure-workflows.mjs --text 文生视频_api.json --image 图生视频_api.json');
    console.log('可只传一种；只创建 studio/workflows.local.json，不覆盖已有配置。');
    return;
  }
  const profiles = {};
  for (let i = 0; i < args.length; i += 2) {
    const [flag, file] = args.slice(i, i + 2);
    if (!optionNames.has(flag) || !file || file.startsWith('--')) throw new Error('请使用 --text 或 --image 加本机 API 图路径。');
    const mode = flag.slice(2);
    if (Object.hasOwn(profiles, mode)) throw new Error('每种模式只能配置一份 API 图。');
    if (!(await stat(file)).isFile() || (await stat(file)).size > 1024 * 1024) throw new Error('API 图必须是 1 MiB 以下的本机文件。');
    const json = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
    profiles[mode] = profileFromExport(json, mode);
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
