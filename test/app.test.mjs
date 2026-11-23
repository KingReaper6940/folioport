import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile as readDisk} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {mount} from '../src/app.mjs';
import {samplePDF,inspectPDF,impose} from '../src/pdf.mjs';
import {example} from '../src/example.mjs';
import {readFile,downloads} from '../src/files.mjs';
const html=await readDisk(new URL('../index.html',import.meta.url),'utf8'),bytes=await samplePDF();
function setup(services){const dom=new JSDOM(html),saved=[],app=mount(dom.window.document,{save:(...x)=>saved.push(x),services});return {dom,d:dom.window.document,saved,app}}
function event(t,id,type){t.d.getElementById(id).dispatchEvent(new t.dom.window.Event(type,{bubbles:true,cancelable:true}))}
function edit(t,id,value){t.d.getElementById(id).value=value;event(t,id,'input')}
async function settle(check){for(let i=0;i<100&&!check();i++)await new Promise(r=>setTimeout(r,5));assert.ok(check(),'asynchronous operation did not settle')}
async function build(t){event(t,'settings','submit');await settle(()=>t.app.isFresh())}
test('simulated workspace makes an actual PDF and all six complete exports',async()=>{
 const t=setup();await t.app.loadSource(bytes,'practice.pdf',example);await build(t);assert.equal(t.app.getResult().audit.outputPages,6);assert.equal(t.d.querySelectorAll('#sides tr').length,6);
 for(const b of t.d.querySelectorAll('[data-export]'))b.click();assert.equal(t.saved.length,6);assert.ok(t.saved[0][2] instanceof Uint8Array);assert.equal(JSON.parse(t.saved[1][2]).schema,'folioport/1');t.dom.window.close();
});
test('dirty and invalid settings disable downloads while retaining previous result as stale',async()=>{
 const t=setup();await t.app.loadSource(bytes,'practice.pdf',example);await build(t);const before=t.app.getResult();edit(t,'margin','-1');event(t,'settings','submit');assert.equal(t.app.getResult(),before);assert.equal(t.app.isFresh(),false);for(const b of t.d.querySelectorAll('[data-export]'))assert.equal(b.disabled,true);t.dom.window.close();
});
test('failed PDF preflight leaves the previous source and fresh output intact',async()=>{
 const t=setup();await t.app.loadSource(bytes,'practice.pdf',example);await build(t);assert.equal(await t.app.loadSource(new Uint8Array([1,2]),'bad.pdf'),false);assert.equal(t.app.getSource().name,'practice.pdf');assert.equal(t.app.isFresh(),true);t.dom.window.close();
});
test('pending source load and pending build cannot overwrite later edits',async()=>{
 let releaseInspect,releaseBuild;const actualInfo=await inspectPDF(bytes,'pending.pdf');
 const t=setup({inspect:()=>new Promise(r=>{releaseInspect=r}),impose:()=>new Promise(r=>{releaseBuild=r})});
 const pending=t.app.loadSource(bytes,'pending.pdf',example);edit(t,'notes','Keep draft');releaseInspect(actualInfo);await pending;assert.equal(t.app.getSource(),null);assert.equal(t.d.getElementById('notes').value,'Keep draft');
 t.dom.window.close();
 const u=setup({impose:()=>new Promise(r=>{releaseBuild=r})});await u.app.loadSource(bytes,'source.pdf',example);event(u,'settings','submit');edit(u,'title','New draft');releaseBuild(await impose(bytes,example));await new Promise(r=>setTimeout(r,0));assert.equal(u.app.isFresh(),false);assert.equal(u.app.getResult(),null);u.dom.window.close();
});
test('all settings accepted by schema can be reopened including a custom signature size',async()=>{
 const t=setup();await t.app.loadSource(bytes,'practice.pdf',{...example,signature:20});await build(t);assert.equal(t.app.getResult().settings.signature,20);t.dom.window.close();
});
test('settings import is atomic, contains no PDF and preserves an already loaded source',async()=>{
 const t=setup();await t.app.loadSource(bytes,'practice.pdf',example);
 for(const p of [{...example,title:'Imported'},{schema:'wrong'}]){
  const encoded=new TextEncoder().encode(JSON.stringify(p));Object.defineProperty(t.d.getElementById('settings-file'),'files',{configurable:true,value:[{size:encoded.length,arrayBuffer:async()=>encoded.buffer}]});event(t,'settings-file','change');await new Promise(r=>setTimeout(r,0));
 }
 assert.equal(t.d.getElementById('title').value,'Imported');assert.equal(t.app.getSource().name,'practice.pdf');assert.match(t.d.getElementById('status').textContent,/intact/);t.dom.window.close();
});
test('source filename and page maps treat imported markup literally',async()=>{
 const t=setup();await t.app.loadSource(bytes,'<img src=x onerror=alert(1)>',example);await build(t);assert.equal(t.d.querySelectorAll('.source-box img').length,0);assert.match(t.d.getElementById('source-name').textContent,/<img/);assert.equal(t.d.querySelectorAll('td.blank').length,2);t.dom.window.close();
});
test('page table pagination never truncates output PDF or exported receipt',async()=>{
 const t=setup(),many=await samplePDF(36);await t.app.loadSource(many,'many.pdf',example);await build(t);assert.equal(t.d.querySelectorAll('#sides tr').length,12);t.d.getElementById('next').click();assert.equal(t.d.querySelectorAll('#sides tr').length,6);t.d.querySelector('[data-export=json]').click();assert.equal(JSON.parse(t.saved[0][2]).layout.sides.length,18);t.dom.window.close();
});
test('clear releases source/result state and restores disabled downloads',async()=>{
 const t=setup();await t.app.loadSource(bytes,'practice.pdf',example);await build(t);t.d.getElementById('clear').click();assert.equal(t.app.getSource(),null);assert.equal(t.app.getResult(),null);assert.equal(t.d.getElementById('build').disabled,true);assert.equal(t.d.querySelectorAll('#sides tr').length,0);t.dom.window.close();
});
test('file byte caps and actual Blob downloads preserve PDF bytes',async()=>{
 await assert.rejects(()=>readFile({size:100},10),/size/);
 const t=setup(),oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,blobs=[],revoked=[];URL.createObjectURL=b=>{blobs.push(b);return 'blob:'+blobs.length};URL.revokeObjectURL=u=>revoked.push(u);t.dom.window.HTMLAnchorElement.prototype.click=function(){};
 try{const d=downloads(t.d);d.save('x.pdf','application/pdf',bytes);assert.deepEqual(new Uint8Array(await blobs[0].arrayBuffer()),bytes);d.save('a.txt','text/plain','a');d.dispose();assert.equal(revoked.length,2)}finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;t.dom.window.close()}
});
test('simulated labels, live status, table caption, skip target and responsive CSS exist',async()=>{
 const t=setup();for(const n of t.d.querySelectorAll('input:not([type=file]),textarea,select'))assert.ok(t.d.querySelector('label[for="'+n.id+'"]'),n.id);
 assert.equal(t.d.getElementById('status').getAttribute('role'),'status');assert.ok(t.d.querySelector('table caption'));assert.ok(t.d.querySelector(t.d.querySelector('.skip').getAttribute('href')));
 const css=await readDisk(new URL('../style.css',import.meta.url),'utf8');assert.match(css,/max-width:760px/);assert.match(css,/focus-visible/);t.dom.window.close();
});
