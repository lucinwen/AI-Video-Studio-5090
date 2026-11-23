import {createServer} from 'node:http';
import {readFile,mkdir,readdir,writeFile,rename,unlink,stat,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID,randomInt,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';
import {profileFromExport} from './configure-workflows.mjs';

const MAX_IMAGE=8*1024*1024, MAX_BODY=Math.ceil(MAX_IMAGE*4/3)+16384;
const validId=/^[\w-]{1,128}$/;
const studioId=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const MAX_JOBS=100;
const REF_MIME=Object.freeze({png:'image/png',jpeg:'image/jpeg',webp:'image/webp'});
const uint32=n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff;
const sha256=value=>createHash('sha256').update(value).digest('hex');
const digestPattern=/^[a-f0-9]{64}$/;
const canonical=o=>Array.isArray(o)?'['+o.map(canonical).join(',')+']':
  o&&typeof o==='object'?'{'+Object.keys(o).sort().map(k=>JSON.stringify(k)+':'+canonical(o[k])).join(',')+'}':JSON.stringify(o);
const isDone=job=>job.state==='succeeded'||job.state==='failed';
const record=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
const err=(code,message)=>Object.assign(new Error(message),{code});

function presetFor(p, mode) {
  if(!record(p?.graph)||!Object.keys(p.graph).length) throw new Error('缺少 API 格式工作流：'+mode);
  function binding(b,type) {
    const inputs=p.graph[b?.node]?.inputs;
    if(typeof b?.node!=='string'||typeof b?.input!=='string'||!Object.hasOwn(p.graph,b.node)||
      !record(inputs)||!Object.hasOwn(inputs,b.input)||(type==='seed'?
        !Number.isSafeInteger(inputs[b.input])||inputs[b.input]<0:typeof inputs[b.input]!=='string'))
      throw new Error('工作流输入映射有误：'+mode);
    return {node:b.node,input:b.input};
  }
  if(typeof p.outputNode!=='string'||!validId.test(p.outputNode)||!Object.hasOwn(p.graph,p.outputNode))
    throw new Error('工作流输出节点有误：'+mode);
  const profile={graph:structuredClone(p.graph),prompt:binding(p.prompt,'text'),
    image:mode==='image'?binding(p.image,'text'):null,
    seed:p.seed==null?null:binding(p.seed,'seed'),outputNode:p.outputNode};
  if(profile.image && profile.image.node===profile.prompt.node && profile.image.input===profile.prompt.input)
    throw new Error('提示词不能与参考图共用同一个字段：'+mode);
  // Hash trusted workflow structure/settings, not incidental JSON object order.
  return {...profile,hash:sha256(canonical({mode,...profile}))};
}
async function bodyJSON(req) {
  const chunks=[];let size=0,exceeded=false;
  if(Number(req.headers['content-length'])>MAX_BODY) {
    req.resume();throw err(413,'参考图太大，请使用 8 MB 以内的图片。');
  }
  await new Promise((resolve,reject)=>{
    req.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY){exceeded=true;reject(err(413,'参考图太大，请使用 8 MB 以内的图片。'));} else if(!exceeded) chunks.push(chunk);});
    req.on('end',resolve);req.on('error',reject);req.on('aborted',()=>reject(err(400,'上传已中断。')));
  });
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw err(400,'请求格式不正确。');}
}
function validImage(bytes,kind) {
  return kind==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    kind==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
    kind==='webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
}
function parseImage(value) {
  if(value==null||value==='')return null;
  const m=typeof value==='string' && /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!m||m[3].length%4)throw err(400,'请上传 PNG、JPEG 或 WebP 图片。');
  const [mime,kind]=m.slice(1,3), bytes=Buffer.from(m[3],'base64');
  if(bytes.length>MAX_IMAGE)throw err(413,'参考图太大，请使用 8 MB 以内的图片。');
  if(!validImage(bytes,kind))throw err(400,'参考图不是有效的 PNG、JPEG 或 WebP 文件。');
  return {bytes,mime,kind};
}
function stillKind(name) {
  const e=/\.(png|jpe?g|webp)$/i.exec(name??'')?.[1].toLowerCase();
  return e==='jpg'?'jpeg':e;
}
const stillDimensions=(w,h)=>w>0&&h>0&&w<=4096&&h<=4096;
// Basic container validation before sending any bytes to the browser. The browser
// remains responsible for fully decoding the compressed image.
function validStill(bytes,kind) {
  if(!validImage(bytes,kind))return false;
  if(kind==='png') {
    let i=8, first=true, data=false;
    while(i+12<=bytes.length){
      const n=bytes.readUInt32BE(i),type=bytes.toString('ascii',i+4,i+8),end=i+12+n;
      if(end>bytes.length)return false;
      if(first&&(type!=='IHDR'||n!==13||!stillDimensions(bytes.readUInt32BE(i+8),bytes.readUInt32BE(i+12))))return false;
      if(type==='IDAT'&&n>0)data=true;
      if(type==='IEND')return data&&n===0&&end===bytes.length;
      first=false;i=end;
    }
    return false;
  }
  if(kind==='jpeg') {
    if(bytes.length<12||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)return false;
    let i=2, frame=false;
    while(i+4<=bytes.length){
      if(bytes[i++]!==255)return false;
      while(bytes[i]===255)i++;
      const marker=bytes[i++];
      if(i+2>bytes.length)return false;
      const n=bytes.readUInt16BE(i);
      if(n<2||i+n>bytes.length)return false;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
        if(n<8||!stillDimensions(bytes.readUInt16BE(i+5),bytes.readUInt16BE(i+3)))return false;
        frame=true;
      }
      if(marker===0xda)return frame&&n>=6&&i+n<bytes.length-2;
      i+=n;
    }
    return false;
  }
  if(kind==='webp') {
    if(bytes.length<26||bytes.readUInt32LE(4)+8!==bytes.length)return false;
    let i=12, picture=false;
    while(i+8<=bytes.length) {
      const type=bytes.toString('ascii',i,i+4),n=bytes.readUInt32LE(i+4),start=i+8;
      if(start+n+(n%2)>bytes.length)return false;
      if(type==='VP8 '&&n>=10&&bytes[start+3]===0x9d&&bytes[start+4]===0x01&&bytes[start+5]===0x2a)
        picture=stillDimensions(bytes.readUInt16LE(start+6)&0x3fff,bytes.readUInt16LE(start+8)&0x3fff);
      if(type==='VP8L'&&n>=5&&bytes[start]===0x2f){
        const size=bytes.readUInt32LE(start+1);
        picture=stillDimensions(1+(size&0x3fff),1+((size>>>14)&0x3fff));
      }
      if(type==='VP8X'&&(n!==10||!stillDimensions(1+bytes.readUIntLE(start+4,3),1+bytes.readUIntLE(start+7,3))))return false;
      i=start+n+(n%2);
    }
    return picture&&i===bytes.length;
  }
  return false;
}
function validArtifact(a,mode) {
  const segment=p=>typeof p==='string'&&p!=='.'&&p!=='..'&&!p.includes(':')&&/^[^/\\\x00-\x1f]{1,240}$/.test(p);
  return segment(a?.filename)&&(mode==='still'?!!stillKind(a.filename):/\.(mp4|webm)$/i.test(a.filename))&&
    (a.type==='output'||a.type==='temp')&&(a.subfolder==null||a.subfolder===''||
    (typeof a.subfolder==='string'&&a.subfolder.length<=300&&a.subfolder.split('/').every(segment)));
}
function artifactOf(h,node,mode) {
  const o=h?.outputs?.[node]??{};
  const files=['videos','gifs','images','files'].flatMap(k=>Array.isArray(o[k])?o[k]:[]);
  const a=files.find(a=>validArtifact(a,mode));
  return a?{filename:a.filename,subfolder:a.subfolder??'',type:a.type}:null;
}
function json(res,code,data) {
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}

/** Loopback Studio HTTP server. Inject request/upstream in local integration tests. */
export function createStudio({presets,configError,request=fetch,html,upstreamOrigin='http://127.0.0.1:8188',pollMs=1800,timeoutMs=2700000,stateDir}={}) {
  const u=new URL(upstreamOrigin);
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)
    throw new Error('ComfyUI 地址必须是本机 127.0.0.1。');
  const graph={},jobs=new Map();
  try {for(const m of ['text','image'])if(presets?.[m])graph[m]=presetFor(presets[m],m);}
  catch(e){configError=e.message;delete graph.text;delete graph.image;}
  try {if(presets?.still)graph.still=presetFor(profileFromExport(presets.still.graph,'still'),'still');}
  catch(e){configError??=e.message;}
  const capabilities={text:!!graph.text,image:!!graph.image,still:!!graph.still};
  const imageRequired=!!graph.image&&!graph.text;
  let stopping=false,stateError;
  function jobPath(id) {return join(stateDir,id+'.json');}
  function referencePath(id) {return join(stateDir,id+'.reference');}
  function validReference(ref) {
    return record(ref)&&Object.hasOwn(REF_MIME,ref.kind)&&typeof ref.sha256==='string'&&digestPattern.test(ref.sha256)&&
      Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=MAX_IMAGE;
  }
  function sourceProfile(job) {
    const current=job.mode==='image'?graph.image:job.mode==='text'?graph.text:null;
    return isDone(job)&&current?.seed&&uint32(job.seed)&&current.hash===job.profileHash?current:null;
  }
  async function referenceAvailable(job) {
    if(!stateDir||!validReference(job.reference))return false;
    try {const st=await lstat(referencePath(job.id));return st.isFile()&&st.size===job.reference.bytes;}
    catch{return false;}
  }
  async function readReference(job) {
    if(!await referenceAvailable(job))return null;
    try {
      const bytes=await readFile(referencePath(job.id));
      const {kind,sha256:expected,bytes:size}=job.reference;
      return bytes.length===size&&sha256(bytes)===expected&&validImage(bytes,kind)?
        {bytes,kind,mime:REF_MIME[kind]}:null;
    } catch{return null;}
  }
  async function discardReference(id) {
    if(!stateDir)return;
    try {await unlink(referencePath(id));} catch(e){if(e.code!=='ENOENT')throw e;}
  }
  function chooseSeed(previous) {
    const value=randomInt(0,0x100000000);
    return value===previous?(value+1)%0x100000000:value;
  }
  async function persist(job) {
    if(!stateDir)return;
    const temp=jobPath(job.id)+'.'+randomUUID()+'.tmp';
    try {
      await writeFile(temp,JSON.stringify({id:job.id,state:job.state,phase:job.phase,createdAt:job.createdAt,
        expiresAt:job.expiresAt,promptId:job.promptId,outputNode:job.outputNode,origin:job.origin,
        error:job.error,artifact:job.artifact,mode:job.mode,seed:job.seed,
        profileHash:job.profileHash,parentId:job.parentId,reference:job.reference}),{encoding:'utf8',flag:'wx',mode:0o600});
      await rename(temp,jobPath(job.id));
    } finally { await unlink(temp).catch(()=>{}); }
  }
  async function saveUpdate(job) {
    try {await persist(job);} catch {console.warn('Studio 无法保存任务状态；请检查本地状态目录。');}
  }
  async function restore() {
    if(!stateDir)return;
    try {
      await mkdir(stateDir,{recursive:true,mode:0o700});
      const entries=await readdir(stateDir,{withFileTypes:true});
      const rows=await Promise.all(entries.filter(e=>e.isFile()&&e.name.endsWith('.json')&&studioId.test(e.name.slice(0,-5))).map(async e=>{
        try{
          const file=join(stateDir,e.name);if((await stat(file)).size>4096)return null;
          const j=JSON.parse(await readFile(file,'utf8'));
          if(!record(j)||j.id!==e.name.slice(0,-5)||!Number.isSafeInteger(j.createdAt)||
            !['queued','running','succeeded','failed'].includes(j.state)||j.origin!==u.origin)return null;
          if(j.state==='succeeded'&&!validArtifact(j.artifact,j.mode))return null;
          if(j.state!=='succeeded')delete j.artifact;
          if(!validReference(j.reference))delete j.reference;
          if(!studioId.test(j.parentId??''))delete j.parentId;
          if(!uint32(j.seed))delete j.seed;
          if(typeof j.profileHash!=='string'||!digestPattern.test(j.profileHash))delete j.profileHash;
          if(!['image','text','still'].includes(j.mode))delete j.mode;
          return j;
        }catch{return null;}
      }));
      const ordered=rows.filter(Boolean).sort((a,b)=>b.createdAt-a.createdAt);
      for(const j of ordered.slice(0,MAX_JOBS).reverse())jobs.set(j.id,j);
    } catch {stateError='本地任务记录无法读取或写入，请检查工作台的状态目录。';}
  }
  const restored=restore();
  async function upstream(path,opts={},ms=20000) {
    const r=await request(u.origin+path,{...opts,redirect:'error',signal:opts.signal??AbortSignal.timeout(ms)});
    if(!r.ok) {
      await r.body?.cancel().catch(()=>{});
      throw new Error('ComfyUI 返回 HTTP '+r.status+'。');
    }
    return r;
  }
  async function readStill(artifact,signal) {
    const kind=stillKind(artifact.filename);
    const r=await upstream('/view?'+new URLSearchParams(artifact),{signal});
    if(r.status!==200||!r.body){await r.body?.cancel().catch(()=>{});throw err(502,'无法读取 ComfyUI 生成的图片。');}
    if(Number(r.headers.get('content-length'))>MAX_IMAGE){
      await r.body.cancel().catch(()=>{});throw err(413,'生成图片超过 8 MB，不能设为视频参考图。');
    }
    const reader=r.body.getReader(), chunks=[];
    let size=0;
    try{
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        size+=value.byteLength;
        if(size>MAX_IMAGE){await reader.cancel().catch(()=>{});throw err(413,'生成图片超过 8 MB，不能设为视频参考图。');}
        chunks.push(value);
      }
    }finally{reader.releaseLock();}
    const bytes=Buffer.concat(chunks,size);
    if(!validStill(bytes,kind))throw err(502,'ComfyUI 没有返回可用的 PNG、JPEG 或 WebP 图片。');
    return {bytes,mime:REF_MIME[kind],ext:kind==='jpeg'?'jpg':kind};
  }
  async function generate(job,p,prompt,image) {
    try {
      const w=structuredClone(p.graph);
      w[p.prompt.node].inputs[p.prompt.input]=prompt;
      if(p.seed)w[p.seed.node].inputs[p.seed.input]=job.seed;
      if(image) {
        const form=new FormData(), filename=job.id+'.'+image.kind;
        form.set('image',new Blob([image.bytes],{type:image.mime}),filename);
        form.set('type','input');form.set('overwrite','false');
        const info=await (await upstream('/upload/image',{method:'POST',body:form})).json();
        if(info.name!==filename||(info.subfolder??'')!==''||(info.type??'input')!=='input')
          throw new Error('ComfyUI 未返回预期的本地参考图。');
        w[p.image.node].inputs[p.image.input]=filename;
      }
      const result=await (await upstream('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt:w,client_id:job.id})})).json();
      const id=result.prompt_id;
      if(typeof id!=='string'||!validId.test(id))throw new Error('ComfyUI 未返回任务编号。');
      job.promptId=id;job.expiresAt=Date.now()+timeoutMs;job.phase='accepted';
      await saveUpdate(job);
      await follow(job);
    } catch(e) {
      job.state='failed';job.error=e instanceof TypeError?'无法连接本机 ComfyUI。':String(e.message??'生成失败。').slice(0,300);
      await saveUpdate(job);
    }
  }
  async function follow(job) {
    try {
      const id=job.promptId;let errors=0, first=true;
      while(!stopping&&(first||Date.now()<job.expiresAt)) {
        first=false;let h;
        try {
          const payload=await (await upstream('/history/'+id)).json();
          h=Object.hasOwn(payload,id)?payload[id]:null;errors=0;
        } catch {
          errors++;
          const delay=Math.min(15000,pollMs*Math.min(16,2**Math.min(errors,4)));
          if(Date.now()<job.expiresAt)await new Promise(resolve=>setTimeout(resolve,delay).unref());
          continue;
        }
        if(h?.status?.status_str==='error')throw new Error('工作流执行失败，请检查 ComfyUI 的模型和节点。');
        const artifact=artifactOf(h,job.outputNode,job.mode);
        if(artifact){job.artifact=artifact;job.state='succeeded';await saveUpdate(job);return;}
        if(h?.status?.completed)throw new Error(job.mode==='still'?'工作流已结束，但指定节点没有输出 PNG、JPEG 或 WebP。':'工作流已结束，但指定节点没有输出 MP4 或 WebM。');
        if(Date.now()>=job.expiresAt)break;
        try {
          const q=await (await upstream('/queue',{},4000)).json();
          if(job.state!=='running'&&Array.isArray(q.queue_running)&&q.queue_running.some(e=>Array.isArray(e)&&e[1]===id)){
            job.state='running';await saveUpdate(job);
          }
        } catch {/* Optional telemetry; /history owns results. */}
        await new Promise(resolve=>setTimeout(resolve,pollMs).unref());
      }
      if(!stopping)throw new Error('等待超时。请确认 ComfyUI 中的任务状态后再重试。');
    }catch(e){
      if(stopping)return;
      job.state='failed';job.error=String(e.message??'生成失败。').slice(0,300);await saveUpdate(job);
    }
  }

  const server=createServer(async(req,res)=>{
    for(const [k,v] of Object.entries({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'"}))res.setHeader(k,v);
    try {
      await restored;
      const port=server.address()?.port, host=req.headers.host;
      if(host!==`127.0.0.1:${port}`&&host!==`localhost:${port}`)return json(res,403,{error:'工作台仅限本机使用。'});
      if(!req.url?.startsWith('/')||req.url.startsWith('//'))return json(res,400,{error:'请求格式不正确。'});
      const url=new URL(req.url,`http://${host}`), path=url.pathname;
      if(req.method==='GET'&&path==='/') {
        const page=html??await readFile(new URL('./index.html',import.meta.url));
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
        return res.end(page);
      }
      if(req.method==='GET'&&path==='/api/status') {
        const common={capabilities,imageRequired,retentionAvailable:!!stateDir&&!stateError};
        if(stateError)return json(res,200,{...common,ready:false,mode:'setup',reason:stateError});
        if(!graph.text&&!graph.image&&!graph.still)return json(res,200,{...common,ready:false,mode:'setup',reason:configError??'尚未配置本地 ComfyUI 工作流。'});
        try {const ping=await upstream('/system_stats',{},3500);await ping.body?.cancel();}
        catch{return json(res,200,{...common,ready:false,mode:'offline',reason:'本机 ComfyUI 未启动或无法连接。'});}
        return json(res,200,{...common,ready:true,mode:'comfyui'});
      }
      const match=/^\/api\/jobs\/([a-f0-9-]{36})(?:\/(video|image|reference|revisions))?$/.exec(path);
      const sameOrigin=req.headers.origin===`http://${host}`&&req.headers['sec-fetch-site']!=='cross-site';
      if(req.method==='POST'&&(path==='/api/jobs'||match?.[2]==='revisions')) {
        if(!sameOrigin)return json(res,403,{error:'只接受创作网页发出的请求。'});
        if((req.headers['content-type']??'').split(';')[0].trim().toLowerCase()!=='application/json')
          return json(res,415,{error:'请求必须使用 JSON。'});
        if(stateError)throw err(503,stateError);
        const data=await bodyJSON(req), prompt=typeof data?.prompt==='string'?data.prompt.trim():'';
        if(!record(data)||!prompt||prompt.length>2000)throw err(400,'请输入 1 至 2000 个字符的画面描述。');
        if(data.retainReference!==undefined&&typeof data.retainReference!=='boolean')throw err(400,'参考图保留设置无效。');
        const isRevision=match?.[2]==='revisions';
        if(data.mode!==undefined&&(isRevision||!['video','still'].includes(data.mode)))throw err(400,'生成模式无效。');
        let retain=data.retainReference===true;
        if(data.seedMode!==undefined&&(!isRevision||!['keep','new'].includes(data.seedMode)))throw err(400,'随机种子设置无效。');
        let image=parseImage(data.image), p, parent, mode, seed;
        if(isRevision) {
          parent=jobs.get(match[1]);
          if(!parent)throw err(404,'找不到要修改的任务。');
          if(parent.mode==='still')throw err(409,'图片任务暂不支持改稿，请新建生成。');
          p=sourceProfile(parent);
          if(!p)throw err(409,'原任务缺少可恢复的种子、尚未结束，或所用工作流设置已改变。请新建生成。');
          mode=parent.mode;
          if(mode==='text'&&image)throw err(409,'此任务来自文生视频；如需参考图，请新建图生视频。');
          if(mode==='image'&&!image){
            image=await readReference(parent);
            if(!image)throw err(409,'没有可恢复的原参考图，请明确选择一张替换图片后再生成。');
            retain=data.retainReference!==false;
          }
          seed=data.seedMode==='new'?chooseSeed(parent.seed):parent.seed;
        } else {
          mode=data.mode==='still'?'still':image?'image':'text';p=graph[mode];
          if(mode==='still'&&(image||retain))throw err(400,'文生图任务不使用参考图。');
          if(!p)throw err(409,mode==='still'?'尚未配置文生图工作流。':image?'尚未配置图生视频工作流。':
            imageRequired?'请选择一张参考图。':'尚未配置文生视频工作流。');
          if(p.seed)seed=chooseSeed();
        }
        if(retain&&!image)throw err(400,'请先选择需要保留的参考图。');
        if(retain&&!stateDir)throw err(409,'此启动模式未启用本地参考图保留。');
        if([...jobs.values()].filter(j=>['queued','running'].includes(j.state)).length>=4)throw err(429,'本机已有 4 个任务，请稍后再试。');
        const id=randomUUID(),job={id,state:'queued',phase:'submitting',origin:u.origin,
          createdAt:Date.now(),outputNode:p.outputNode,mode,seed,profileHash:p.hash,parentId:parent?.id};
        jobs.set(id,job);
        try{
          if(retain){
            await writeFile(referencePath(id),image.bytes,{flag:'wx',mode:0o600});
            job.reference={kind:image.kind,bytes:image.bytes.length,sha256:sha256(image.bytes)};
          }
          await persist(job);
        }catch{
          jobs.delete(id);if(retain)await discardReference(id).catch(()=>{});
          throw err(503,'无法写入本地任务记录，没有启动生成。');
        }
        if(jobs.size>MAX_JOBS)for(const [old,j] of jobs)if(isDone(j)){
          jobs.delete(old);
          if(stateDir){
            await discardReference(old).catch(()=>{});
            await unlink(jobPath(old)).catch(()=>{});
          }
          break;
        }
        json(res,202,{id});void generate(job,p,prompt,image);return;
      }
      if(match?.[2]==='reference'&&req.method==='DELETE'){
        if(!sameOrigin)return json(res,403,{error:'只接受创作网页发出的请求。'});
        const job=jobs.get(match[1]);
        if(!job)return json(res,404,{error:'找不到此任务。'});
        await discardReference(job.id);
        // Availability is derived from the stored file. Keep generation metadata immutable.
        res.writeHead(204,{'Cache-Control':'no-store'});return res.end();
      }
      if(req.method==='GET'&&match&&match[2]!=='revisions') {
        const job=jobs.get(match[1]);
        if(!job)return json(res,404,{error:'找不到此任务，可能已超出近期历史记录。'});
        if(!match[2]){
          const referenceRetained=await referenceAvailable(job);
          return json(res,200,{state:job.state,error:job.error,mode:job.mode,
            video:job.artifact&&job.mode!=='still'?path+'/video':undefined,image:job.artifact&&job.mode==='still'?path+'/image':undefined,
            canRevise:!!sourceProfile(job),hasReference:job.mode==='image'?true:['text','still'].includes(job.mode)?false:undefined,
            referenceRetained,reference:referenceRetained?path+'/reference':undefined,seed:job.seed,parentId:job.parentId});
        }
        if(match[2]==='reference'){
          if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'参考图只限本机工作台预览。'});
          const image=await readReference(job);
          if(!image)return json(res,404,{error:'这张参考图未保留或已经不可用。'});
          res.writeHead(200,{'Content-Type':image.mime,'Content-Length':image.bytes.length,'Cache-Control':'no-store'});
          return res.end(image.bytes);
        }
        if(match[2]==='image'){
          if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'生成图片只限本机工作台预览。'});
          if(job.mode!=='still'||!job.artifact)return json(res,404,{error:'图片尚未生成。'});
          const controller=new AbortController();res.once('close',()=>controller.abort());
          const image=await readStill(job.artifact,AbortSignal.any([AbortSignal.timeout(20000),controller.signal]));
          res.writeHead(200,{'Content-Type':image.mime,'Content-Length':image.bytes.length,'Cache-Control':'no-store',
            'Content-Disposition':(url.searchParams.get('download')==='1'?'attachment':'inline')+'; filename="studio-'+job.id+'.'+image.ext+'"'});
          return res.end(image.bytes);
        }
        if(!job.artifact||job.mode==='still')return json(res,404,{error:'视频尚未生成。'});
        const range=req.headers.range;
        if(range&&!/^bytes=(?:\d{1,15}-\d{0,15}|-\d{1,15})$/.test(range))return json(res,416,{error:'无效的视频播放范围。'});
        const controller=new AbortController();res.once('close',()=>controller.abort());
        const r=await request(u.origin+'/view?'+new URLSearchParams(job.artifact),{
          headers:range?{Range:range}:{},redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(120000),controller.signal])});
        if(r.status===416){const v=r.headers.get('content-range');if(v)res.setHeader('Content-Range',v);await r.body?.cancel();return json(res,416,{error:'视频范围超出文件。'});}
        if(![200,206].includes(r.status)||!r.body){await r.body?.cancel();throw err(502,'无法读取 ComfyUI 生成视频。');}
        const ext=/\.webm$/i.test(job.artifact.filename)?'webm':'mp4', headers={'Content-Type':'video/'+ext,'Cache-Control':'no-store',
          'Content-Disposition':(url.searchParams.get('download')==='1'?'attachment':'inline')+`; filename="studio-${job.id}.${ext}"`};
        for(const name of ['content-length','content-range','accept-ranges']) {
          const v=r.headers.get(name);if(v)headers[name]=v;
        }
        res.writeHead(r.status,headers);await pipeline(Readable.fromWeb(r.body),res);return;
      }
      json(res,404,{error:'找不到这个页面。'});
    }catch(e){
      if(!res.headersSent&&!res.destroyed)json(res,Number.isInteger(e.code)?e.code:502,
        {error:Number.isInteger(e.code)?e.message:'本地服务暂时不可用，请检查工作台和 ComfyUI。'});
      else if(!res.destroyed)res.destroy();
    }
  });
  server.on('listening',()=>void restored.then(async()=>{
    for(const job of [...jobs.values()]){
      if(isDone(job))continue;
      if(typeof job.promptId==='string'&&validId.test(job.promptId)&&typeof job.outputNode==='string'&&
          validId.test(job.outputNode)&&Number.isSafeInteger(job.expiresAt))void follow(job);
      else{
        job.state='failed';job.error='上次关闭时未收到 ComfyUI 任务编号。请检查 ComfyUI 队列后重试；工作台不会自动重复提交。';
        await saveUpdate(job);
      }
    }
  }));
  server.on('close',()=>{stopping=true;});return server;
}
async function main(){
  let presets,configError;
  try{presets=JSON.parse(await readFile(process.env.STUDIO_CONFIG??new URL('./workflows.local.json',import.meta.url),'utf8'));}
  catch(e){configError=e.code==='ENOENT'?'尚未配置本地工作流，请按 studio/README.md 设置。':'工作流配置无法读取，请检查 JSON 文件。';}
  const port=Number(process.env.STUDIO_PORT??'8787');
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('STUDIO_PORT 应为 1024 到 65535。');
  const upstreamOrigin=process.env.STUDIO_COMFY_ORIGIN??'http://127.0.0.1:8188';
  const stateDir=process.env.STUDIO_STATE_DIR??join(process.env.LOCALAPPDATA??homedir(),'AI-Video-Studio','creator-studio',String(port));
  createStudio({presets,configError,upstreamOrigin,stateDir}).listen(port,'127.0.0.1',()=>console.log('AI Video Studio: http://127.0.0.1:'+port));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
