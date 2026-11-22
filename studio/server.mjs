import {createServer} from 'node:http';
import {readFile,mkdir,readdir,writeFile,rename,unlink,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';

const MAX_IMAGE=8*1024*1024, MAX_BODY=Math.ceil(MAX_IMAGE*4/3)+16384;
const validId=/^[\w-]{1,128}$/;
const studioId=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const isDone=job=>job.state==='succeeded'||job.state==='failed';
const record=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
const err=(code,message)=>Object.assign(new Error(message),{code});

function presetFor(p, mode) {
  if(!record(p?.graph)||!Object.keys(p.graph).length) throw new Error('缺少 API 格式工作流：'+mode);
  function binding(b) {
    const inputs=p.graph[b?.node]?.inputs;
    if(typeof b?.node!=='string'||typeof b?.input!=='string'||!Object.hasOwn(p.graph,b.node)||
      !record(inputs)||!Object.hasOwn(inputs,b.input)||typeof inputs[b.input]!=='string')
      throw new Error('工作流输入映射有误：'+mode);
    return {node:b.node,input:b.input};
  }
  if(typeof p.outputNode!=='string'||!validId.test(p.outputNode)||!Object.hasOwn(p.graph,p.outputNode))
    throw new Error('工作流输出节点有误：'+mode);
  return {graph:structuredClone(p.graph),prompt:binding(p.prompt),
    image:mode==='image'?binding(p.image):null,outputNode:p.outputNode};
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
function parseImage(value) {
  if(value==null||value==='')return null;
  const m=typeof value==='string' && /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!m||m[3].length%4)throw err(400,'请上传 PNG、JPEG 或 WebP 图片。');
  const [mime,kind]=m.slice(1,3), bytes=Buffer.from(m[3],'base64');
  if(bytes.length>MAX_IMAGE)throw err(413,'参考图太大，请使用 8 MB 以内的图片。');
  const valid=kind==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    kind==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
    bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!valid)throw err(400,'参考图不是有效的 PNG、JPEG 或 WebP 文件。');
  return {bytes,mime,kind};
}
function validArtifact(a) {
  const segment=p=>typeof p==='string'&&p!=='.'&&p!=='..'&&!p.includes(':')&&/^[^/\\\x00-\x1f]{1,240}$/.test(p);
  return segment(a?.filename)&&/\.(mp4|webm)$/i.test(a.filename)&&
    (a.type==='output'||a.type==='temp')&&(a.subfolder==null||a.subfolder===''||
    (typeof a.subfolder==='string'&&a.subfolder.length<=300&&a.subfolder.split('/').every(segment)));
}
function artifactOf(h,node) {
  const o=h?.outputs?.[node]??{};
  const files=['videos','gifs','images','files'].flatMap(k=>Array.isArray(o[k])?o[k]:[]);
  const a=files.find(validArtifact);
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
  const capabilities={text:!!graph.text,image:!!graph.image};
  const imageRequired=!!graph.image&&!graph.text;
  let stopping=false,stateError;
  function jobPath(id) {return join(stateDir,id+'.json');}
  async function persist(job) {
    if(!stateDir)return;
    const temp=jobPath(job.id)+'.'+randomUUID()+'.tmp';
    try {
      await writeFile(temp,JSON.stringify({id:job.id,state:job.state,phase:job.phase,createdAt:job.createdAt,
        expiresAt:job.expiresAt,promptId:job.promptId,outputNode:job.outputNode,origin:job.origin,
        error:job.error,artifact:job.artifact}),{encoding:'utf8',flag:'wx',mode:0o600});
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
          if(j.state==='succeeded'&&!validArtifact(j.artifact))return null;
          if(j.state!=='succeeded')delete j.artifact;
          return j;
        }catch{return null;}
      }));
      const ordered=rows.filter(Boolean).sort((a,b)=>b.createdAt-a.createdAt);
      for(const j of ordered.slice(0,100).reverse())jobs.set(j.id,j);
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
  async function generate(job,p,prompt,image) {
    try {
      const w=structuredClone(p.graph);
      w[p.prompt.node].inputs[p.prompt.input]=prompt;
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
        const artifact=artifactOf(h,job.outputNode);
        if(artifact){job.artifact=artifact;job.state='succeeded';await saveUpdate(job);return;}
        if(h?.status?.completed)throw new Error('工作流已结束，但指定节点没有输出 MP4 或 WebM。');
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
        const common={capabilities,imageRequired};
        if(stateError)return json(res,200,{...common,ready:false,mode:'setup',reason:stateError});
        if(!graph.text&&!graph.image)return json(res,200,{...common,ready:false,mode:'setup',reason:configError??'尚未配置本地 ComfyUI 工作流。'});
        try {const ping=await upstream('/system_stats',{},3500);await ping.body?.cancel();}
        catch{return json(res,200,{...common,ready:false,mode:'offline',reason:'本机 ComfyUI 未启动或无法连接。'});}
        return json(res,200,{...common,ready:true,mode:'comfyui'});
      }
      if(req.method==='POST'&&path==='/api/jobs') {
        if(req.headers.origin!==`http://${host}`||req.headers['sec-fetch-site']==='cross-site')
          return json(res,403,{error:'只接受创作网页发出的请求。'});
        if((req.headers['content-type']??'').split(';')[0].trim().toLowerCase()!=='application/json')
          return json(res,415,{error:'请求必须使用 JSON。'});
        if(stateError)throw err(503,stateError);
        const data=await bodyJSON(req), prompt=typeof data?.prompt==='string'?data.prompt.trim():'';
        if(!record(data)||!prompt||prompt.length>2000)throw err(400,'请输入 1 至 2000 个字符的画面描述。');
        const image=parseImage(data.image), p=graph[image?'image':'text'];
        if(!p)throw err(409,image?'尚未配置图生视频工作流。':imageRequired?'请选择一张参考图。':'尚未配置文生视频工作流。');
        if([...jobs.values()].filter(j=>['queued','running'].includes(j.state)).length>=4)throw err(429,'本机已有 4 个任务，请稍后再试。');
        const id=randomUUID(),job={id,state:'queued',phase:'submitting',origin:u.origin,
          createdAt:Date.now(),outputNode:p.outputNode};
        jobs.set(id,job);
        try{await persist(job);}catch{jobs.delete(id);throw err(503,'无法写入本地任务记录，没有启动生成。');}
        if(jobs.size>100)for(const [old,j] of jobs)if(isDone(j)){
          jobs.delete(old);if(stateDir)await unlink(jobPath(old)).catch(()=>{});break;
        }
        json(res,202,{id});void generate(job,p,prompt,image);return;
      }
      const match=/^\/api\/jobs\/([a-f0-9-]{36})(\/video)?$/.exec(path);
      if(req.method==='GET'&&match) {
        const job=jobs.get(match[1]);
        if(!job)return json(res,404,{error:'找不到此任务，可能已超出近期历史记录。'});
        if(!match[2])return json(res,200,{state:job.state,error:job.error,video:job.artifact?path+'/video':undefined});
        if(!job.artifact)return json(res,404,{error:'视频尚未生成。'});
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
