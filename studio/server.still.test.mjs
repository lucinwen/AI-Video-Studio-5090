import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {createStudio} from './server.mjs';

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGMUjprGwMDAxMDAwMDAAAALywEHR4ma8gAAAABJRU5ErkJggg==','base64');
const MP4=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
const MAX_IMAGE=8*1024*1024;
const origin='http://127.0.0.1:8188';
const artifact=filename=>({filename,subfolder:'studio output',type:'output'});
const fileImage=artifact('fixture.png');
const fileVideo=artifact('fixture.mp4');
const json=value=>new Response(JSON.stringify(value));
const modePresets={
  still:{graph:{
    '1':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:'local/test.safetensors'}},
    '2':{class_type:'CLIPTextEncode',inputs:{text:'initial',clip:['1',1]}},
    '3':{class_type:'CLIPTextEncode',inputs:{text:'negative',clip:['1',1]}},
    '4':{class_type:'EmptyLatentImage',inputs:{width:512,height:512,batch_size:1}},
    '5':{class_type:'KSampler',inputs:{model:['1',0],seed:42,steps:20,cfg:7,sampler_name:'euler',scheduler:'normal',positive:['2',0],negative:['3',0],latent_image:['4',0],denoise:1}},
    '6':{class_type:'VAEDecode',inputs:{samples:['5',0],vae:['1',2]}},
    '7':{class_type:'SaveImage',inputs:{images:['6',0],filename_prefix:'studio/still'}},
  },prompt:{node:'2',input:'text'},seed:{node:'5',input:'seed'},outputNode:'7'},
  text:{graph:{positive:{class_type:'CLIPTextEncode',inputs:{text:'initial'}},saveVideo:{class_type:'SaveVideo',inputs:{filename_prefix:'studio/video'}}},prompt:{node:'positive',input:'text'},outputNode:'saveVideo'},
  image:{graph:{positive:{class_type:'CLIPTextEncode',inputs:{text:'initial'}},load:{class_type:'LoadImage',inputs:{image:'fixture.png'}},saveVideo:{class_type:'SaveVideo',inputs:{filename_prefix:'studio/video'}}},prompt:{node:'positive',input:'text'},image:{node:'load',input:'image'},outputNode:'saveVideo'},
};

async function settled(read,why='mocked job did not settle') {
  for(let i=0;i<100;i++) {
    const info=await read();
    if(['succeeded','failed'].includes(info?.state))return info;
    await sleep(10);
  }
  assert.fail(why);
}
async function open(t,params={}) {
  const server=createStudio({pollMs:10,html:'<p>test studio</p>',...params});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  const stop=()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  t.after(()=>server.listening?stop():undefined);
  const get=(path,opts)=>fetch(base+path,opts);
  const post=(data,path='/api/jobs',from=base)=>get(path,{method:'POST',
    headers:{'Content-Type':'application/json',Origin:from},body:JSON.stringify(data)});
  const status=async()=>(await get('/api/status')).json();
  const job=async id=>(await get('/api/jobs/'+id)).json();
  const finish=id=>settled(()=>job(id),`job ${id} did not settle`);
  return {base,get,post,status,job,finish,stop};
}
async function accept(response) {
  const body=await response.json();
  assert.equal(response.status,202,body.error);
  assert.match(body.id,/^[a-f0-9-]{36}$/);
  return body.id;
}
function mock({stillOutputs={images:[fileImage]},stillView,videoOutputs={videos:[fileVideo]}}={}) {
  const calls=[], prompts=[], uploads=[];
  const seen=new Map();
  const pngView=()=>new Response(PNG,{headers:{'Content-Type':'image/png','Content-Length':String(PNG.length)}});
  async function request(address,options) {
    const url=new URL(address);assert.equal(url.origin,origin);assert.equal(options.redirect,'error');
    calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams)});
    if(url.pathname==='/system_stats')return json({});
    if(url.pathname==='/upload/image') {
      const f=options.body.get('image');
      assert.equal(f.type,'image/png');assert.equal(options.body.get('overwrite'),'false');
      uploads.push({name:f.name,bytes:Buffer.from(await f.arrayBuffer())});
      return json({name:f.name,type:'input',subfolder:''});
    }
    if(url.pathname==='/prompt') {
      const {prompt}=JSON.parse(options.body), id='fake'+(prompts.length+1);
      prompts.push(prompt);
      seen.set(id,prompt['7']?.class_type==='SaveImage'?{'7':stillOutputs}:{saveVideo:videoOutputs});
      return json({prompt_id:id});
    }
    if(url.pathname.startsWith('/history/')) {
      const id=url.pathname.slice('/history/'.length);
      assert.ok(seen.has(id),'expected known mocked prompt');
      return json({[id]:{status:{completed:true},outputs:seen.get(id)}});
    }
    if(url.pathname==='/view'){
      assert.equal(url.searchParams.get('type'),'output');assert.equal(url.searchParams.get('subfolder'),'studio output');
      const fname=url.searchParams.get('filename');
      if(fname?.endsWith('.png'))return (stillView??pngView)();
      assert.equal(fname,'fixture.mp4');
      return new Response(MP4,{headers:{'Content-Type':'video/mp4','Content-Length':String(MP4.length)}});
    }
    throw new Error('Unexpected mocked upstream path: '+url.pathname);
  }
  return {request,prompts,uploads,calls};
}

test('optional still capability is independent; legacy implicit text mode is not reinterpreted',async t=>{
  const existing=mock();
  const legacy=await open(t,{presets:{text:modePresets.text},request:existing.request});
  const before=await legacy.status();assert.equal(before.ready,true);assert.notEqual(before.capabilities.still,true);
  const noStill=await legacy.post({mode:'still',prompt:'A still'});
  assert.equal(noStill.status,409);
  assert.equal(existing.prompts.length,0);
  const textJob=await legacy.finish(await accept(await legacy.post({prompt:'Text mode remains video'})));
  assert.equal(textJob.state,'succeeded');assert.ok(textJob.video);assert.equal(textJob.image,undefined);

  const only=mock();
  const studio=await open(t,{presets:{still:modePresets.still},request:only.request});
  const available=await studio.status();
  assert.equal(available.ready,true);assert.equal(available.capabilities.still,true);
  assert.equal(available.capabilities.text,false);assert.equal(available.capabilities.image,false);
  assert.equal((await studio.post({mode:'invented-mode',prompt:'Invalid selection'})).status,400);
  assert.equal((await studio.post({prompt:'Do not silently generate still'})).status,409);
  assert.equal(only.prompts.length,0);
});

test('still uses only the trusted still workflow; retrieve its bytes and explicitly reuse for I2V',async t=>{
  const upstream=mock();
  const s=await open(t,{presets:modePresets,request:upstream.request});
  assert.equal((await s.post({mode:'still',prompt:'blocked'},'/api/jobs','https://not-local.example')).status,403);
  const validRef='data:image/png;base64,'+PNG.toString('base64');
  assert.equal((await s.post({mode:'still',prompt:'Do not silently discard this reference',image:validRef})).status,400);
  assert.equal(upstream.prompts.length,0);
  const id=await accept(await s.post({mode:'still',prompt:'  Blue desk light  ',graph:{external:1}}));
  const still=await s.finish(id);
  assert.equal(still.state,'succeeded',still.error);assert.equal(still.mode,'still');
  assert.equal(still.image,'/api/jobs/'+id+'/image');assert.equal(still.video,undefined);
  assert.equal(upstream.prompts[0]['2'].inputs.text,'Blue desk light');
  assert.equal(upstream.prompts[0]['3'].inputs.text,'negative');
  assert.equal(upstream.prompts[0]['7'].inputs.filename_prefix,'StudioStill');
  assert.equal(upstream.prompts[0]['1'].inputs.ckpt_name,'local/test.safetensors');
  assert.equal(upstream.prompts[0].external,undefined);
  assert.ok(!upstream.prompts[0].saveVideo);
  assert.ok(Number.isInteger(still.seed)&&still.seed>=0&&still.seed<=0xffffffff);
  assert.equal(still.seed,upstream.prompts[0]['5'].inputs.seed);
  assert.equal(upstream.uploads.length,0);
  assert.equal((await s.get('/api/jobs/'+id+'/video')).status,404);
  assert.equal((await s.get(still.image,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  const output=await s.get(still.image);
  assert.equal(output.status,200);assert.equal(output.headers.get('content-type'),'image/png');
  assert.equal(output.headers.get('cache-control'),'no-store');
  assert.equal(output.headers.get('x-content-type-options'),'nosniff');
  assert.deepEqual(Buffer.from(await output.arrayBuffer()),PNG);
  const download=await s.get(still.image+'?download=1');
  assert.equal(download.status,200);
  assert.match(download.headers.get('content-disposition')??'',/^attachment\b.*\.png"/i);
  const retainedBytes=Buffer.from(await download.arrayBuffer());
  assert.deepEqual(retainedBytes,PNG);
  assert.equal(upstream.prompts.length,1,'display and download must not enqueue another generation');

  const clipId=await accept(await s.post({mode:'video',prompt:'Sweep left',image:'data:image/png;base64,'+retainedBytes.toString('base64')}));
  const clip=await s.finish(clipId);
  assert.equal(clip.state,'succeeded',clip.error);
  assert.equal(clip.video,'/api/jobs/'+clipId+'/video');
  assert.equal(clip.image,undefined);
  assert.equal(upstream.uploads.length,1);
  assert.deepEqual(upstream.uploads[0].bytes,PNG);
  assert.equal(upstream.prompts[1].load.inputs.image,upstream.uploads[0].name);
  assert.equal(upstream.prompts[1].positive.inputs.text,'Sweep left');
  assert.equal((await s.get('/api/jobs/'+clipId+'/image')).status,404);
  assert.deepEqual(Buffer.from(await (await s.get(clip.video)).arrayBuffer()),MP4);
});

test('history cannot use a video as a still, a still as a video, or an untrusted saved path',async t=>{
  const upstream=mock({stillOutputs:{images:[{...fileImage,filename:'../escape.png'},fileVideo]},videoOutputs:{images:[fileImage]}});
  const s=await open(t,{presets:modePresets,request:upstream.request});
  const still=await s.finish(await accept(await s.post({mode:'still',prompt:'Expect no image'})));
  assert.equal(still.state,'failed');
  assert.equal(still.image,undefined);assert.equal(still.video,undefined);
  const text=await s.finish(await accept(await s.post({prompt:'Expect no video'})));
  assert.equal(text.state,'failed');
  assert.equal(text.image,undefined);assert.equal(text.video,undefined);
  assert.equal(upstream.calls.filter(c=>c.path==='/view').length,0,'never retrieve an unapproved artifact');
});

test('invalid optional still graph never disables an otherwise valid video workflow',async t=>{
  const unsafe=structuredClone(modePresets.still);
  unsafe.graph['1'].inputs.ckpt_name='../out-of-scope.safetensors';
  const u=mock();const s=await open(t,{presets:{text:modePresets.text,still:unsafe},request:u.request});
  const info=await s.status();assert.equal(info.ready,true);
  assert.deepEqual(info.capabilities,{text:true,image:false,still:false});
  assert.equal((await s.post({mode:'still',prompt:'Disabled'})).status,409);
  assert.equal(u.prompts.length,0);
  const job=await s.finish(await accept(await s.post({prompt:'I am still a video'})));
  assert.equal(job.state,'succeeded');assert.ok(job.video);
});

test('wrong and oversized still content is not served to the browser as an image',async t=>{
  const samples=[
    ['non-image bytes',()=>new Response(MP4,{headers:{'Content-Type':'image/png'}})],
    ['PNG signature without a complete container',()=>new Response(PNG.subarray(0,PNG.length-5),{headers:{'Content-Type':'image/png'}})],
    ['oversized declared length',()=>new Response(PNG,{headers:{'Content-Type':'image/png','Content-Length':String(MAX_IMAGE+1)}})],
    ['oversized body without length',()=>new Response(new ReadableStream({start(c){
      const bytes=Buffer.alloc(MAX_IMAGE+1);
      PNG.copy(bytes);c.enqueue(bytes);c.close();
    }}),{headers:{'Content-Type':'image/png'}})],
  ];
  for(const [name,stillView] of samples)await t.test(name,async t=>{
    const u=mock({stillView});const s=await open(t,{presets:{still:modePresets.still},request:u.request});
    const id=await accept(await s.post({mode:'still',prompt:'Fault injected upstream'}));
    const done=await s.finish(id);
    const preview=await s.get('/api/jobs/'+id+'/image');assert.ok(preview.status>=400,name);
    assert.notEqual(preview.headers.get('content-type'),'image/png',name);
    if(done.state==='failed')assert.equal(done.image,undefined);
  });
});

test('saved still survives restart as still and never resubmits its prompt',async t=>{
  const stateDir=await mkdtemp(join(tmpdir(),'studio-still-test-'));
  t.after(()=>rm(stateDir,{recursive:true,force:true}));
  const u=mock();const options={presets:modePresets,request:u.request,stateDir};
  const first=await open(t,options);
  const id=await accept(await first.post({mode:'still',prompt:'private draft scene'}));
  const generated=await first.finish(id);assert.equal(generated.state,'succeeded');
  let saved;
  for(let i=0;i<100;i++) {
    saved=JSON.parse(await readFile(join(stateDir,id+'.json'),'utf8'));
    if(saved.state==='succeeded')break;
    await sleep(10);
  }
  assert.equal(saved.state,'succeeded');assert.equal(saved.mode,'still');
  assert.equal(saved.prompt,undefined);assert.equal(saved.image,undefined);
  await first.stop();
  const next=await open(t,options);
  const restored=await next.job(id);
  assert.equal(restored.state,'succeeded');assert.equal(restored.mode,'still');
  assert.equal(restored.image,generated.image);assert.equal(restored.video,undefined);
  assert.deepEqual(Buffer.from(await(await next.get(restored.image)).arrayBuffer()),PNG);
  assert.equal(u.prompts.length,1);
});
