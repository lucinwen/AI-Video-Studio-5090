import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, copyFile, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {profileFromExport} from './configure-workflows.mjs';

function still() {
  return {
    '11':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:'studio/sd-local.safetensors'}},
    '12':{class_type:'CLIPTextEncode',inputs:{text:'negative',clip:['11',1]}},
    '13':{class_type:'CLIPTextEncode',inputs:{text:'positive',clip:['11',1]}},
    '14':{class_type:'EmptyLatentImage',inputs:{width:1024,height:576,batch_size:1}},
    '15':{class_type:'KSampler',inputs:{model:['11',0],seed:42,steps:20,cfg:7.5,sampler_name:'euler',scheduler:'normal',positive:['13',0],negative:['12',0],latent_image:['14',0],denoise:1}},
    '16':{class_type:'VAEDecode',inputs:{samples:['15',0],vae:['11',2]}},
    '17':{class_type:'SaveImage',inputs:{images:['16',0],filename_prefix:'../unsafe/test'},_meta:{title:'Export only'}}
  };
}

test('still derives exact positive prompt from topology, preserves negative, and normalizes output',()=>{
  const raw=still();
  const p=profileFromExport({prompt:raw},'still');
  assert.equal(p.outputNode,'17');
  assert.deepEqual(p.prompt,{node:'13',input:'text'});
  assert.deepEqual(p.seed,{node:'15',input:'seed'});
  assert.equal(p.graph['12'].inputs.text,'negative');
  assert.equal(p.graph['17'].inputs.filename_prefix,'StudioStill');
  assert.equal(p.graph['17']._meta,undefined);
  assert.notEqual(p.graph,raw);
  assert.equal(raw['17'].inputs.filename_prefix,'../unsafe/test');
});

test('still rejects extra/custom nodes, nonstandard inputs and uncoupled edges',()=>{
  let g=still();
  g['200']={class_type:'Unknown',inputs:{}};
  assert.throws(()=>profileFromExport(g,'still'),/自定义节点/);
  g=still();
  g['200']={class_type:'SaveImage',inputs:{images:['16',0],filename_prefix:'extra'}};
  assert.throws(()=>profileFromExport(g,'still'),/SaveImage 数量/);
  g=still(); g['17'].inputs.ignored_extra='x';
  assert.throws(()=>profileFromExport(g,'still'),/标准 API 输入/);
  g=still(); g['15'].inputs.positive=['12',0];
  assert.throws(()=>profileFromExport(g,'still'),/正、负提示词分别/);
  g=still(); g['16'].inputs.vae=['11',1];
  assert.throws(()=>profileFromExport(g,'still'),/Checkpoint/);
  g=still(); g['13'].inputs.text=['12',0];
  assert.throws(()=>profileFromExport(g,'still'),/提示词必须是文字/);
});

test('still rejects traversal, absolute paths, unsafe model format and excessive batch/dimensions',()=>{
  for(const name of ['../x.safetensors','foo\\..\\x.safetensors','/x.safetensors','C:\\x.safetensors','foo/x.ckpt','//host/share/x.safetensors']) {
    const g=still(); g['11'].inputs.ckpt_name=name;
    assert.throws(()=>profileFromExport(g,'still'),/权重/);
  }
  const g=still(); g['14'].inputs.batch_size=2;
  assert.throws(()=>profileFromExport(g,'still'),/批量张数需为 1/);
  g['14'].inputs.batch_size=1; g['14'].inputs.width=4096;
  assert.throws(()=>profileFromExport(g,'still'),/宽高/);
});

test('legacy video API imports preserve existing contract',()=>{
  const graph={
    '3':{class_type:'KSampler',inputs:{seed:42}},'6':{class_type:'CLIPTextEncode',inputs:{text:'x'}},
    '55':{class_type:'Wan22ImageToVideoLatent',inputs:{vae:['1',0]}},'58':{class_type:'SaveVideo',inputs:{video:['99',0]}}
  };
  assert.deepEqual(profileFromExport(graph,'text'),{graph,prompt:{node:'6',input:'text'},seed:{node:'3',input:'seed'},outputNode:'58'});
  graph['56']={class_type:'LoadImage',inputs:{image:'input.png'}};
  graph['55'].inputs.start_image=['56',0];
  assert.deepEqual(profileFromExport(graph,'image').image,{node:'56',input:'image'});
  assert.throws(()=>profileFromExport(graph,'text'),/停用参考图/);
});

test('local CLI runs offline for still, then refuses to overwrite any existing config',async()=>{
  const d=await mkdtemp(join(tmpdir(),'configure-still-test-'));
  try {
    const cli=join(d,'configure-workflows.mjs'), file=join(d,'export.json'), out=join(d,'workflows.local.json');
    await copyFile(new URL('./configure-workflows.mjs',import.meta.url),cli);
    await writeFile(file,'\ufeff'+JSON.stringify(still()));
    const run=promisify(execFile);
    await run(process.execPath,[cli,'--still',file]);
    const old=await readFile(out,'utf8');
    assert.deepEqual(Object.keys(JSON.parse(old)),['still']);
    assert.equal(JSON.parse(old).still.prompt.node,'13');
    await assert.rejects(run(process.execPath,[cli,'--still',file]),/已有 workflows.local.json/);
    assert.equal(await readFile(out,'utf8'),old);
  } finally {await rm(d,{recursive:true,force:true});}
});
