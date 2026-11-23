import {validate,page,MAX_BYTES} from './model.mjs';
import {inspectPDF,impose,samplePDF} from './pdf.mjs';
import {example} from './example.mjs';
import {settingsJSON,reportJSON,orderCSV,guideHTML,mapSVG} from './exports.mjs';
import {readFile,downloads} from './files.mjs';
export function mount(document,options={}){
 const $=id=>document.getElementById(id),save=options.save||downloads(document).save;
 const services={inspect:inspectPDF,impose,sample:samplePDF,...options.services};
 let source=null,info=null,result=null,fresh=false,revision=0,index=0;
 const buttons=[...document.querySelectorAll('[data-export]')],node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n};
 function status(text,kind=''){$('status').textContent=text;$('status').className=kind}
 function stale(){revision++;fresh=false;buttons.forEach(b=>b.disabled=true);$('freshness').textContent=result?'PREVIOUS PLAN IS STALE':'NOT BUILT';status('Source or settings changed. Make the booklet again to enable downloads.','stale')}
 function read(){
  const p={schema:'folioport/1',title:$('title').value,paper:$('paper').value,binding:$('binding').value,notes:$('notes').value};
  for(const k of ['signature','margin','gutter']){const text=$(k).value;if(!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text))throw Error('Use nonnegative decimal settings without spaces or exponents.');p[k]=Number(text)}
  return validate(p);
 }
 function fields(p){if(![...document.getElementById('signature').options].some(o=>Number(o.value)===p.signature)){const o=node('option',p.signature+' pages · '+p.signature/4+' sheets');o.value=p.signature;document.getElementById('signature').append(o)}for(const k of ['title','paper','signature','margin','gutter','binding','notes'])$(k).value=p[k]}
 function showSource(){
  $('source-name').textContent=info?.name||'No PDF selected';$('source-info').textContent=info?info.pages+' pages · '+(info.bytes/1024).toFixed(1)+' KiB':'1–128 pages · up to 10 MiB';
  $('source-hash').textContent=info?.sha256||'No source loaded.';
  $('source-warning').textContent=info?info.annotations+' source annotations detected. Output contains page artwork only; annotations, links, tags, bookmarks, attachments and source metadata are not copied.':'Page artwork only. Interactive document features are not retained.';
  $('build').disabled=!source;
 }
 function renderSides(){
  const slice=page(result.layout.sides,index);index=slice.current;
  $('sides').replaceChildren(...slice.items.map(s=>{
   const tr=document.createElement('tr');tr.append(node('td',s.number),node('td',s.signature+' / '+s.sheet),node('td',s.face));
   for(const value of [s.left,s.right]){const td=node('td',value??'Blank');td.className='panel-page'+(value===null?' blank':'');tr.append(td)}return tr;
  }));
  $('empty').hidden=true;$('side-count').textContent=result.audit.outputPages+' output PDF pages';
  $('page').textContent='Page '+(index+1)+' of '+slice.pages+' · 12 per page';$('previous').disabled=index===0;$('next').disabled=index>=slice.pages-1;
 }
 function render(){
  const a=result.audit;$('metrics').replaceChildren(...[['source pages',a.sourcePages],['physical sheets',a.sheets],['blank panels added',a.blankPanels]].map(([label,value])=>{const d=document.createElement('div');d.append(node('strong',value),node('span',label));return d}));
  $('audit').textContent='Page order checked: every source page appears exactly once, in order when each signature is folded. '+a.paddedPages+' total panels.';
  $('output-info').textContent=a.outputPages+' output PDF pages · '+(result.pdfBytes.length/1024).toFixed(1)+' KiB. Landscape, front then back for each sheet. Already two-up.';
  $('signatures').replaceChildren(...result.layout.signatures.map(s=>{const li=document.createElement('li');li.append(node('strong','Signature '+s.number+' · source pages '+s.start+'–'+s.end),node('span',s.sheets+' sheets · '+s.blanks+' added blank panels. Nest outer to inner.'));return li}));
  renderSides();
 }
 async function loadSource(bytes,name,settings){
  const nextSettings=settings?validate(settings):null;const token=++revision;status('Reading PDF locally…');
  try{const next=await services.inspect(bytes,name);if(token!==revision)return false;source=Uint8Array.from(bytes);info=next;if(nextSettings)fields(nextSettings);showSource();stale();status('PDF ready: '+info.pages+' source pages. Review settings, then make the booklet.');return true}
  catch(error){if(token===revision)status('PDF not opened; previous source kept. '+error.message,'error');return false}
 }
 $('settings').addEventListener('input',stale);$('settings').addEventListener('change',stale);
 $('settings').addEventListener('submit',async e=>{
  e.preventDefault();if(!source){status('Open a PDF first.','error');return}
  let p;try{p=read()}catch(error){stale();status(error.message,'error');return}
  const token=++revision,bytes=source,name=info.name;fresh=false;buttons.forEach(b=>b.disabled=true);$('freshness').textContent='BUILDING';status('Building booklet PDF locally…');
  try{const next=await services.impose(bytes,p,name);if(token!==revision)return;result=next;fresh=true;index=0;buttons.forEach(b=>b.disabled=false);$('freshness').textContent='ORDER AUDIT PASSED';render();status('Booklet ready. Download and inspect the PDF, then print a numbered duplex test.')}
  catch(error){if(token===revision){stale();status('Booklet not built. '+error.message+' Previous results are stale.','error')}}
 });
 $('pdf-file').addEventListener('change',async()=>{
  const file=$('pdf-file').files?.[0];if(!file)return;const token=++revision;
  try{const bytes=await readFile(file,MAX_BYTES);if(token===revision)await loadSource(bytes,file.name)}
  catch(error){if(token===revision)status(error.message,'error')}
  finally{$('pdf-file').value=''}
 });
 $('sample').addEventListener('click',async()=>{
  const token=++revision;status('Preparing numbered practice PDF…');
  try{const bytes=await services.sample();if(token===revision)await loadSource(bytes,'numbered-practice.pdf',example)}
  catch(error){if(token===revision)status(error.message,'error')}
 });
 $('sample-download').addEventListener('click',async()=>{try{save('folioport-numbered-practice.pdf','application/pdf',await services.sample());status('Downloaded the original numbered sample. Open it here to make a duplex fold test.')}catch(error){status(error.message,'error')}});
 $('settings-file').addEventListener('change',async()=>{
  const file=$('settings-file').files?.[0];if(!file)return;const token=++revision;
  try{const bytes=await readFile(file,40000);if(token!==revision)return;const p=validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));fields(p);stale();status('Settings opened. Source PDF is separate; open it if needed and make the booklet again.')}
  catch(error){if(token===revision)status('Settings not imported; existing work intact. '+error.message,'error')}
  finally{$('settings-file').value=''}
 });
 $('clear').addEventListener('click',()=>{
  revision++;source=null;info=null;result=null;fresh=false;index=0;$('settings').reset();buttons.forEach(b=>b.disabled=true);showSource();$('freshness').textContent='NOT BUILT';$('sides').replaceChildren();$('empty').hidden=false;$('side-count').textContent='No output yet';$('page').textContent='Page 1 of 1';$('previous').disabled=true;$('next').disabled=true;
  $('metrics').replaceChildren(...['source pages','physical sheets','blank panels added'].map(label=>{const d=document.createElement('div');d.append(node('strong',0),node('span',label));return d}));$('audit').textContent='Your page-order audit will appear here.';$('output-info').textContent='Every sheet has a front and a back PDF page.';$('signatures').replaceChildren(node('li','Make a booklet to see its folding groups.'));status('Workspace cleared. No source or generated PDF is retained here.');
 });
 for(const [id,delta] of [['previous',-1],['next',1]])$(id).addEventListener('click',()=>{if(result){index+=delta;renderSides()}});
 const outputs={pdf:['folioport-booklet.pdf','application/pdf',r=>r.pdfBytes],settings:['folioport-settings.json','application/json',settingsJSON],json:['folioport-receipt.json','application/json',reportJSON],csv:['folioport-order.csv','text/csv',orderCSV],html:['folioport-print-guide.html','text/html',guideHTML],svg:['folioport-order.svg','image/svg+xml',mapSVG]};
 for(const b of buttons)b.addEventListener('click',()=>{if(!fresh||!result)return;try{const [name,type,fn]=outputs[b.dataset.export];save(name,type,fn(result));status('Downloaded '+name+'. Entire booklet included. Inspect the PDF before printing.')}catch(error){status(error.message,'error')}});
 return {loadSource,getResult:()=>result,isFresh:()=>fresh,getSource:()=>info};
}
if(typeof document!=='undefined')mount(document);
