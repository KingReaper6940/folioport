import test from 'node:test';
import assert from 'node:assert/strict';
import {validate,geometry,fit} from '../src/model.mjs';
import {plan} from '../src/plan.mjs';
import {audit} from '../src/audit.mjs';
import {example} from '../src/example.mjs';
import {orderCSV,guideHTML,mapSVG,settingsJSON,reportJSON} from '../src/exports.mjs';
const make=(n,extra={})=>plan(n,{...example,...extra});
test('strict settings validate actual supported sizes and reject malformed input',()=>{
 const copy=validate(example);copy.notes='changed';assert.notEqual(copy.notes,example.notes);
 for(const extra of [{schema:'bad'},{unknown:1},{signature:7},{signature:132},{margin:NaN},{gutter:21},{paper:'__proto__'},{binding:'top'},{title:'\ud800'},{notes:'x'.repeat(4001)}])assert.throws(()=>validate({...example,...extra}));
});
test('eight-page left binding has independently specified standard booklet pairs',()=>{
 const p=make(8);assert.deepEqual(p.sides.map(s=>[s.left,s.right]),[[8,1],[2,7],[6,3],[4,5]]);assert.equal(audit(p).sheets,2);
});
test('right binding mirrors panel placement on both faces',()=>{
 assert.deepEqual(make(8,{binding:'right'}).sides.map(s=>[s.left,s.right]),[[1,8],[7,2],[3,6],[5,4]]);
});
test('last signature pads to four rather than a full configured signature',()=>{
 const p=make(18,{signature:16});assert.deepEqual(p.signatures.map(s=>[s.start,s.end,s.padded]),[[1,16,16],[17,18,4]]);assert.deepEqual(p.sides.slice(-2).map(s=>[s.left,s.right]),[[null,17],[18,null]]);assert.equal(audit(p).blankPanels,2);
});
test('one-booklet mode includes all pages and handles the one-page edge case',()=>{
 assert.equal(make(31,{signature:0}).signatures.length,1);assert.deepEqual(make(1).sides.map(s=>[s.left,s.right]),[[null,1],[null,null]]);
 for(const n of [0,129,1.5,NaN])assert.throws(()=>make(n));
});
test('fold reconstruction and exact once-only coverage hold for all bounded counts',t=>{
 let count=0;
 for(let n=1;n<=128;n++)for(const signature of [0,4,8,12,16,24,32,64,128])for(const binding of ['left','right']){
  const p=make(n,{signature,binding}),a=audit(p),pages=p.sides.flatMap(s=>[s.left,s.right]).filter(v=>v!==null);
  assert.deepEqual(pages.slice().sort((x,y)=>x-y),Array.from({length:n},(_,i)=>i+1));assert.equal(a.foldedReadingOrder.filter(v=>v!==null).length,n);assert.deepEqual(a.foldedReadingOrder.filter(v=>v!==null),Array.from({length:n},(_,i)=>i+1));assert.equal(a.outputPages,a.sheets*2);count++;
 }
 t.diagnostic(count+' page-count/signature/binding combinations verified.');
});
test('auditor rejects duplicate, missing, reversed, misnumbered and false-padding plans',()=>{
 for(const mutate of [p=>{p.sides[0].left=p.sides[0].right},p=>p.sides.pop(),p=>p.sides.reverse(),p=>{p.sides[0].sheet=5},p=>{p.signatures[0].padded+=4},p=>{p.blanks=99}]){
  const p=make(10);mutate(p);assert.throws(()=>audit(p));
 }
});
test('paper geometry and proportional fit stay within both slots without distortion',()=>{
 for(const paper of ['a4','letter'])for(const margin of [0,6,20])for(const gutter of [0,4,20])for(const box of [{width:420,height:595},{width:800,height:400},{width:36,height:3000}]){
  const g=geometry({...example,paper,margin,gutter});
  assert.ok(g.slots[0].x+g.slots[0].width<=g.slots[1].x);
  for(const slot of g.slots){const f=fit(box,slot);assert.ok(f.x>=slot.x-1e-8&&f.y>=slot.y-1e-8);assert.ok(f.x+f.width<=slot.x+slot.width+1e-8);assert.ok(f.y+f.height<=slot.y+slot.height+1e-8);assert.ok(Math.abs(f.width/f.height-box.width/box.height)<1e-8)}
 }
});
test('complete reports preserve settings while source bytes never enter exported JSON',()=>{
 const layout=make(10),r={settings:example,layout,audit:audit(layout),source:{name:'sample.pdf',pages:10,sha256:'abc',annotations:0},placements:[],pdfBytes:new Uint8Array([1,2,3])};
 assert.deepEqual(JSON.parse(settingsJSON(r)),example);assert.equal(JSON.parse(reportJSON(r)).pdfBytes,undefined);assert.equal(orderCSV(r).split('\r\n').length,8);assert.match(mapSVG(r),/not PDF artwork/);assert.match(guideHTML(r),/already imposed/);
});
test('imported text is escaped throughout HTML and SVG export contexts',()=>{
 const settings={...example,title:'</title><script>alert(1)</script>',notes:'<img src=x onerror=alert(1)>'},layout=plan(10,settings),r={settings,layout,audit:audit(layout),source:{name:'<svg onload=alert(1)>',pages:10,sha256:'abc',annotations:1}};
 assert.ok(!guideHTML(r).includes('<script>'));assert.ok(!guideHTML(r).includes('<img src=x'));assert.ok(!mapSVG(r).includes('<script>'));assert.match(guideHTML(r),/&lt;img/);
});
