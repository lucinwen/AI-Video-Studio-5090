import {test} from 'node:test';
import {strict as a} from 'node:assert';
import {once} from 'node:events';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {setTimeout as wait} from 'node:timers/promises';
import {createStudio} from './server.mjs';

const graph={'6':{inputs:{text:''}},'56':{inputs:{image:''}},'58':{inputs:{}}};
const text={graph,prompt:{node:'6',input:'text'},outputNode:'58'};
const image={...text,image:{node:'56',input:'image'}};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
const imageData='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const origin='http://127.0.0.1:8188';
const outfile={filename:'fixture.mp4',subfolder:'studio',type:'output'};
const payload={mock1:{status:{completed:true},outputs:{'58':{images:[outfile]}}}};

async function open(params) {
  const s=createStudio({pollMs:10,html:'<p>studio fixture</p>',...params});
  s.listen(0,'127.0.0.1');await once(s,'listening');
  const base='http://127.0.0.1:'+s.address().port;
  const stop=async()=>{await new Promise(resolve=>s.close(resolve));};
  return {base,stop,post:(data,from=base)=>fetch(base+'/api/jobs',{method:'POST',
    headers:{'Content-Type':'application/json',Origin:from},body:JSON.stringify(data)})};
}
async function until(f) {
  for(let i=0;i<100;i++){const v=await f();if(v)return v;await wait(10);}
  throw new Error('operation did not settle');
}
async function fixture(t) {
  const stateDir=await mkdtemp(join(tmpdir(),'studio-test-'));
  t.after(()=>rm(stateDir,{recursive:true,force:true}));
  return stateDir;
}

test('I2V upload, trusted graph, status, generated result and Range/download response',async t=>{
  let submitted,uploaded;
  const stateDir=await fixture(t);
  const request=async(address,o)=>{
    const url=new URL(address);a.equal(url.origin,origin);a.equal(o.redirect,'error');
    if(url.pathname==='/system_stats')return json({});
    if(url.pathname==='/upload/image'){
      a.equal(o.body.get('overwrite'),'false');a.equal(o.body.get('image').type,'image/png');
      uploaded=o.body.get('image').name;return json({name:uploaded,type:'input'});
    }
    if(url.pathname==='/prompt'){submitted=JSON.parse(o.body);return json({prompt_id:'mock1'});}
    if(url.pathname==='/history/mock1')return json(payload);
    if(url.pathname==='/view'){
      a.equal(url.searchParams.get('filename'),'fixture.mp4');a.equal(o.headers.Range,'bytes=0-3');
      return new Response('1234',{status:206,headers:{'content-range':'bytes 0-3/8','content-length':'4','accept-ranges':'bytes'}});
    }
    throw new Error(url.pathname);
  };
  const s=await open({presets:{image},request,stateDir});t.after(s.stop);
  a.equal(await(await fetch(s.base)).text(),'<p>studio fixture</p>');
  const status=await(await fetch(s.base+'/api/status')).json();
  a.equal(status.ready,true);a.equal(status.imageRequired,true);a.deepEqual(status.capabilities,{text:false,image:true,still:false});
  a.equal((await s.post({prompt:'look',image:imageData},'https://elsewhere.example')).status,403);
  a.equal((await s.post({prompt:'look',image:'data:image/png;base64,AAAA'})).status,400);
  a.equal((await s.post({prompt:'look'})).status,409);
  const accepted=await s.post({prompt:'look',image:imageData,graph:{disallowed:1}});
  a.equal(accepted.status,202);const {id}=await accepted.json();
  const completed=await until(async()=>{const j=await(await fetch(s.base+'/api/jobs/'+id)).json();return j.state==='succeeded'&&j;});
  a.equal(submitted.prompt['56'].inputs.image,uploaded);a.equal(submitted.prompt['6'].inputs.text,'look');
  a.equal(submitted.prompt.disallowed,undefined);
  const clip=await fetch(s.base+completed.video+'?download=1',{headers:{Range:'bytes=0-3'}});
  a.equal(clip.status,206);a.match(clip.headers.get('content-disposition'),/^attachment/);
  a.equal(await clip.text(),'1234');
  const saved=await until(async()=>{const d=JSON.parse(await readFile(join(stateDir,id+'.json'),'utf8'));return d.state==='succeeded'&&d;});
  a.equal(saved.promptId,'mock1');a.equal(saved.prompt,undefined);a.equal(saved.image,undefined);
});
test('resumes acknowledged job without submitting again, refuses to replay unknown job',async t=>{
  const stateDir=await fixture(t);
  const ack=randomUUID(), unknown=randomUUID(), done=randomUUID();
  await Promise.all([[ack,{state:'running',promptId:'mock1',expiresAt:Date.now()-8000}],[unknown,{state:'queued'}],
    [done,{state:'succeeded',artifact:outfile}]].map(([id,row])=>writeFile(join(stateDir,id+'.json'),JSON.stringify({
      id,origin,outputNode:'58',createdAt:Date.now(),...row}))));
  const seen=[];
  const s=await open({presets:{text},stateDir,request:async addr=>{
    const u=new URL(addr);seen.push(u.pathname);
    if(u.pathname==='/history/mock1')return json(payload);
    throw new Error('Unexpected upstream call: '+u.pathname);
  }});t.after(s.stop);
  const state=async id=>(await(await fetch(s.base+'/api/jobs/'+id)).json()).state;
  await until(async()=>await state(ack)==='succeeded'&&await state(unknown)==='failed');
  a.equal(await state(done),'succeeded');
  a.deepEqual(seen,['/history/mock1']);
});
test('unconfigured and unreachable statuses stay distinct',async t=>{
  const first=await open({});t.after(first.stop);
  const second=await open({presets:{text},request:async()=>{throw new TypeError('offline');}});t.after(second.stop);
  a.equal((await(await fetch(first.base+'/api/status')).json()).mode,'setup');
  a.equal((await(await fetch(second.base+'/api/status')).json()).mode,'offline');
});

test('keeps a known job recoverable while ComfyUI is slow to reconnect',async t=>{
  const stateDir=await fixture(t), id=randomUUID();
  await writeFile(join(stateDir,id+'.json'),JSON.stringify({id,origin,outputNode:'58',
    createdAt:Date.now(),state:'running',promptId:'mock1',expiresAt:Date.now()+10000}));
  let probes=0;
  const s=await open({presets:{text},stateDir,request:async addr=>{
    a.equal(new URL(addr).pathname,'/history/mock1');
    if(++probes<=3)throw new TypeError('still starting');
    return json(payload);
  }});t.after(s.stop);
  await until(async()=>(await(await fetch(s.base+'/api/jobs/'+id)).json()).state==='succeeded');
  a.equal(probes,4);
});

function seedPreset(p) {
  return {...p,graph:{...p.graph,'3':{inputs:{seed:898471028164125,steps:20}}},seed:{node:'3',input:'seed'}};
}
function mockGeneration() {
  const submissions=[], refUploads=[];
  const request=async(address,options)=>{
    const url=new URL(address);a.equal(url.origin,origin);
    if(url.pathname==='/system_stats')return json({});
    if(url.pathname==='/upload/image'){
      const file=options.body.get('image');
      const bytes=Buffer.from(await file.arrayBuffer());
      refUploads.push({name:file.name,bytes});return json({name:file.name,type:'input'});
    }
    if(url.pathname==='/prompt'){
      submissions.push(JSON.parse(options.body));return json({prompt_id:'mock1'});
    }
    if(url.pathname==='/history/mock1')return json(payload);
    throw new Error('Unexpected upstream call: '+url.pathname);
  };
  return {request,submissions,refUploads};
}
const info=async(s,id)=>(await fetch(s.base+'/api/jobs/'+id)).json();
const finished=(s,id)=>until(async()=>{const job=await info(s,id);return job.state==='succeeded'&&job;});
async function revise(s,id,data,{from=s.base}={}){
  return fetch(s.base+'/api/jobs/'+id+'/revisions',{method:'POST',headers:{'Content-Type':'application/json',Origin:from},
    body:JSON.stringify(data)});
}
async function accept(r){const body=await r.json();a.equal(r.status,202,body.error);return body.id;}
const refContents=Buffer.from(imageData.split(',')[1],'base64');

test('private image and profile survive restart; revisions retain reference and seed by default',async t=>{
  const stateDir=await fixture(t), {request,submissions,refUploads}=mockGeneration();
  const opts={stateDir,presets:{image:seedPreset(image)},request};
  const first=await open(opts);
  const parent=await accept(await first.post({prompt:'first',image:imageData,retainReference:true}));
  const before=await finished(first,parent);
  await until(async()=>{const d=JSON.parse(await readFile(join(stateDir,parent+'.json'),'utf8'));return d.state==='succeeded'&&d;});
  await first.stop();
  const next=await open(opts);t.after(next.stop);
  const parentInfo=await info(next,parent);
  a.deepEqual(parentInfo,before);a.equal(parentInfo.hasReference,true);
  a.equal(parentInfo.referenceRetained,true);a.equal(parentInfo.canRevise,true);
  a.equal(parentInfo.seed,submissions[0].prompt['3'].inputs.seed);
  a.ok(parentInfo.seed>=0&&parentInfo.seed<=0xffffffff);
  const preview=await fetch(next.base+parentInfo.reference);
  a.equal(preview.headers.get('content-type'),'image/png');
  a.equal(preview.headers.get('cache-control'),'no-store');
  a.deepEqual(Buffer.from(await preview.arrayBuffer()),refContents);
  a.equal((await revise(next,parent,{prompt:'second'},{from:'https://elsewhere.example'})).status,403);
  const child=await accept(await revise(next,parent,{prompt:'second'}));
  const childInfo=await finished(next,child);
  a.equal(childInfo.parentId,parent);a.equal(childInfo.seed,parentInfo.seed);
  a.equal(childInfo.referenceRetained,true);
  a.deepEqual(refUploads[1].bytes,refUploads[0].bytes);
  const aGraph=structuredClone(submissions[0].prompt);
  const bGraph=structuredClone(submissions[1].prompt);
  // The receiver uses unique per-job names for identical source bytes; other generation inputs stay fixed.
  aGraph['56'].inputs.image=bGraph['56'].inputs.image;
  aGraph['6'].inputs.text='second';
  a.deepEqual(aGraph,bGraph);
  const reroll=await accept(await revise(next,parent,{prompt:'third',seedMode:'new',retainReference:false}));
  const rerollInfo=await finished(next,reroll);
  a.notEqual(rerollInfo.seed,parentInfo.seed);a.equal(rerollInfo.referenceRetained,false);
  a.deepEqual(await info(next,parent),before);
  const deletePath=next.base+parentInfo.reference;
  a.equal((await fetch(deletePath,{method:'DELETE',headers:{Origin:'https://elsewhere.example'}})).status,403);
  a.equal((await fetch(deletePath,{method:'DELETE',headers:{Origin:next.base}})).status,204);
  a.equal((await fetch(deletePath)).status,404);
  a.equal((await info(next,parent)).referenceRetained,false);
  a.equal((await info(next,child)).referenceRetained,true);
});

test('unretained or corrupted sources cannot silently run; explicit replacement and unchanged graph required',async t=>{
  const stateDir=await fixture(t), {request,submissions}=mockGeneration();
  const options={stateDir,presets:{image:seedPreset(image)},request};
  const first=await open(options);
  const noRef=await accept(await first.post({prompt:'no retention',image:imageData}));
  const result=await finished(first,noRef);
  a.equal(result.canRevise,true);
  a.equal(result.referenceRetained,false);
  a.equal((await revise(first,noRef,{prompt:'missing source'})).status,409);
  a.equal(submissions.length,1);
  const replaced=await accept(await revise(first,noRef,{prompt:'new explicit source',image:imageData,retainReference:true}));
  const replacement=await finished(first,replaced);
  a.equal(replacement.parentId,noRef);
  a.equal(replacement.referenceRetained,true);
  await writeFile(join(stateDir,replaced+'.reference'),Buffer.alloc(refContents.length,0));
  a.equal((await fetch(first.base+replacement.reference)).status,404);
  a.equal((await revise(first,replaced,{prompt:'reject corrupt source'})).status,409);
  a.equal(submissions.length,2);
  await until(async()=>{const d=JSON.parse(await readFile(join(stateDir,replaced+'.json'),'utf8'));return d.state==='succeeded'&&d;});
  await first.stop();
  const changed=seedPreset(image);changed.graph['3'].inputs.steps=25;
  const next=await open({...options,presets:{image:changed}});t.after(next.stop);
  a.equal((await info(next,replaced)).canRevise,false);
  a.equal((await revise(next,replaced,{prompt:'reject drift',image:imageData})).status,409);
  a.equal(submissions.length,2);
});

test('text-only revisions do not silently switch modes and seedless legacy jobs remain playable',async t=>{
  const {request,submissions}=mockGeneration();
  const first=await open({presets:{text:seedPreset(text)},request});t.after(first.stop);
  a.equal((await first.post({prompt:'invalid retain',retainReference:true})).status,400);
  const parent=await accept(await first.post({prompt:'first'}));
  const ready=await finished(first,parent);a.equal(ready.hasReference,false);
  a.equal((await revise(first,parent,{prompt:'unexpected image',image:imageData})).status,409);
  a.equal((await revise(first,parent,{prompt:'bad seed',seedMode:'unknown'})).status,400);
  const child=await accept(await revise(first,parent,{prompt:'second'}));
  a.equal((await finished(first,child)).seed,ready.seed);
  const legacy=await open({presets:{text},request});t.after(legacy.stop);
  const old=await accept(await legacy.post({prompt:'legacy'}));
  const oldState=await finished(legacy,old);
  a.equal(oldState.canRevise,false);a.equal(oldState.seed,undefined);a.ok(oldState.video);
  a.equal((await revise(legacy,old,{prompt:'not a frozen seed'})).status,409);
  a.equal(submissions.length,3);
});
