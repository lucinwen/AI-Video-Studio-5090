const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const script=fs.readFileSync(path.join(__dirname,'index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
class El {
 constructor(){this.value='';this.children=[];this.dataset={};this.attrs={};}
 replaceChildren(...children){this.children=children}
 removeAttribute(k){delete this.attrs[k]}
 setAttribute(k,v){this.attrs[k]=v}
 querySelector(s){const nodes=[...this.children];while(nodes.length){const n=nodes.shift();if(s==='[data-compare]'&&Object.hasOwn(n.dataset,'compare'))return n;nodes.push(...n.children)}}
 append(...c){this.children.push(...c)}
 insertBefore(el,before){const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,el)}
 focus(){ }
}
const event={preventDefault(){}};
const set=()=>new Promise(setImmediate);
const complete=(id,props={})=>({state:'succeeded',video:'/api/jobs/'+id+'/video',...props});
function setup({recent=[],status={ready:true,mode:'comfyui',retentionAvailable:true,capabilities:{text:true,image:true}},getJob=complete}={}){
 const elements=new Map(), store=new Map([['creator-studio-jobs-v1',JSON.stringify(recent)]]), calls=[];
 const element=k=>{if(!elements.has(k))elements.set(k,new El);return elements.get(k)};
 const state={confirm:true};
 const ctx=vm.createContext({window:{confirm:()=>state.confirm},document:{getElementById:element,createElement:()=>new El},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},Option:function(){},URL,location:{protocol:'http:',href:'http://127.0.0.1:3030/',origin:'http://127.0.0.1:3030'},AbortSignal,setInterval(){},FileReader:class{readAsDataURL(){this.result='data:image/png;base64,bWVkaWE=';this.onload();}},fetch:async(route,init)=>{
   calls.push({route,method:init.method||'GET',body:init.body?JSON.parse(init.body):null});
   const data=route==='/api/status'?status:init.method==='POST'?{id:'fresh-job'}:getJob(route.split('/').at(-1));
   return {ok:true,json:async()=>data};
 }});
 vm.runInContext(script,ctx);
 const image=()=>{const file=new Blob(['media'],{type:'image/png'});file.name='ref.png';return file;};
 const addImage=()=>element('reference').onchange({target:{files:[image()]}});
 return {element,store,calls,state,ctx,image,addImage};
}
function find(element, text){const stack=[element];while(stack.length){const item=stack.shift();if(item.textContent===text)return item;stack.push(...item.children);}throw Error('Missing UI control '+text);}

test('two succeeded candidates compare without submitting and can each download',async()=>{
 const m=setup({recent:['a','b','c'].map(id=>({id,prompt:id,state:'succeeded',video:'/api/jobs/'+id+'/video'}))});
 await set();const records=m.element('results-list').children;
 for(const card of records)find(card,'加入对比').onclick();
 assert.equal(m.element('compare-panel').hidden,false);
 assert.match(m.element('compare-hint').textContent,/已选两条/);
 assert.equal(find(m.element('compare-grid'),'下载 候选 A').download,'studio-a.mp4');
 assert.equal(find(m.element('compare-grid'),'下载 候选 B').download,'studio-b.mp4');
 assert.equal(m.calls.filter(c=>c.method==='POST').length,0);
 m.element('compare-clear').onclick();assert.equal(m.element('compare-panel').hidden,true);
});

test('revision preserves parent seed/ref by ID; unrelated image requires explicit disposal; leaving resets mode',async()=>{
 const m=setup({recent:[{id:'parent',prompt:'历史描述',state:'succeeded',video:'/old'}],getJob:id=>complete(id,{canRevise:true,hasReference:true,referenceRetained:true,seed:50})});
 await set();m.addImage();m.element('idea').value='正在编辑的草稿';
 const reuse=find(m.element('results-list'),'从此改版');
 m.state.confirm=false;reuse.onclick();assert.equal(m.element('idea').value,'正在编辑的草稿');
 m.state.confirm=true;reuse.onclick();
 assert.equal(m.element('idea').value,'历史描述');assert.equal(m.element('ref-row').hidden,true);
 assert.match(m.element('revision-note').textContent,/原参考图.*50/);
 assert.equal(m.calls.filter(c=>c.method==='POST').length,0);
 await m.element('quick-form').onsubmit(event);
 const post=m.calls.find(c=>c.method==='POST');
 assert.equal(post.route,'/api/jobs/parent/revisions');
 assert.deepEqual(post.body,{prompt:'历史描述',seedMode:'keep'});
 m.element('clear-revision').onclick();
 assert.equal(m.element('revision').hidden,true);
 assert.equal(m.element('idea').value,'历史描述');
});

test('unretained reference needs an explicit image; retention is opt-in',async()=>{
 const m=setup({recent:[{id:'parent',prompt:'镜头描述',state:'succeeded',video:'/old'}],getJob:id=>complete(id,{canRevise:true,hasReference:true,referenceRetained:false,seed:24})});
 await set();find(m.element('results-list'),'从此改版').onclick();
 await m.element('quick-form').onsubmit(event);
 assert.match(m.element('quick-status').textContent,/明确添加/);
 assert.equal(m.calls.filter(c=>c.method==='POST').length,0);
 m.addImage();assert.equal(m.element('retain-reference').checked,false);
 await m.element('quick-form').onsubmit(event);
 const first=m.calls.filter(c=>c.method==='POST')[0];assert.ok(first.body.image);assert.equal('retainReference' in first.body,false);
 m.element('retain-reference').checked=true;
 await m.element('quick-form').onsubmit(event);
 const second=m.calls.filter(c=>c.method==='POST')[1];assert.equal(second.body.retainReference,true);
});

test('text revision cannot carry selected, pasted or dropped image and normal Enter stays multiline',async()=>{
 const m=setup({recent:[{id:'parent',prompt:'镜头描述',state:'succeeded',video:'/old'}],getJob:id=>complete(id,{canRevise:true,hasReference:false,seed:8})});
 await set();m.addImage();find(m.element('results-list'),'从此改版').onclick();assert.equal(m.element('ref-row').hidden,true);
 m.addImage();assert.match(m.element('quick-status').textContent,/文生视频改版/);
 let count=0;m.element('quick-form').requestSubmit=()=>count++;
 m.element('idea').onkeydown({key:'Enter',preventDefault(){}});
 m.element('idea').onkeydown({key:'Enter',ctrlKey:true,isComposing:true,preventDefault(){}});
 assert.equal(count,0);
 m.element('idea').onkeydown({key:'Enter',ctrlKey:true,preventDefault(){}});
 assert.equal(count,1);
 await m.element('quick-form').onsubmit(event);
 assert.deepEqual(m.calls.find(c=>c.method==='POST').body,{prompt:'镜头描述',seedMode:'keep'});
 assert.equal(vm.runInContext("safeVideo('https://example.test/video')",m.ctx),'');
});
