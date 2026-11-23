import {PDFDocument,PDFName,PDFNumber,PDFDict,StandardFonts,rgb} from 'pdf-lib';
import {validate,geometry,fit,MAX_BYTES} from './model.mjs';
import {plan} from './plan.mjs';
import {audit} from './audit.mjs';
function bytesOf(input){
 const bytes=input instanceof Uint8Array?Uint8Array.from(input):new Uint8Array(input);
 if(!bytes.length||bytes.length>MAX_BYTES)throw Error('PDF must be nonempty and at most 10 MiB.');
 return bytes;
}
async function read(input,name='document.pdf'){
 const bytes=bytesOf(input);
 let doc;try{doc=await PDFDocument.load(bytes,{ignoreEncryption:false,updateMetadata:false,throwOnInvalidObject:true})}catch{throw Error('Cannot read this PDF. Encrypted, damaged or unsupported files are not accepted.')}
 const pages=doc.getPages();if(pages.length<1||pages.length>128)throw Error('Source PDF must have 1–128 pages.');
 const form=doc.getForm();if(form.hasXFA()||form.getFields().length)throw Error('Interactive forms, XFA and signature fields are unsupported. Use a separate static artwork PDF.');
 let annotations=0;
 const boxes=pages.map((page,i)=>{
  const rotation=((page.getRotation().angle%360)+360)%360;
  if(rotation!==0)throw Error('Source page '+(i+1)+' has /Rotate. Normalize page rotation in another tool first.');
  const unit=page.node.get(PDFName.of('UserUnit'));if(unit&&(!(unit instanceof PDFNumber)||unit.asNumber()!==1))throw Error('Source page '+(i+1)+' uses unsupported UserUnit scaling.');
  const box=page.getCropBox(),media=page.getMediaBox(),all=[box.x,box.y,box.width,box.height,media.x,media.y,media.width,media.height];
  if(all.some(n=>!Number.isFinite(n))||box.width<36||box.height<36||box.width>3000||box.height>3000||box.x<media.x-.01||box.y<media.y-.01||box.x+box.width>media.x+media.width+.01||box.y+box.height>media.y+media.height+.01)throw Error('Source page '+(i+1)+' has an unsupported crop rectangle.');
  const annots=page.node.Annots();annotations+=annots?.size()||0;
  if(annots)for(let j=0;j<annots.size();j++)if(annots.lookup(j,PDFDict).get(PDFName.of('Subtype'))?.toString()==='/Widget')throw Error('Page widgets are unsupported, including orphaned form or signature widgets.');
  return {...box,hasContent:!!page.node.Contents()};
 });
 const hash=Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
 return {doc,bytes,info:{name:String(name).slice(0,200),bytes:bytes.length,pages:pages.length,sha256:hash,annotations,boxes}};
}
export async function inspectPDF(input,name){return (await read(input,name)).info}
export async function impose(input,settings,name){
 const p=validate(settings),source=await read(input,name),layout=plan(source.info.pages,p),receipt=audit(layout),geo=geometry(p),out=await PDFDocument.create(),placements=[];
 out.setTitle(p.title||'Folioport booklet');out.setCreator('Folioport');out.setProducer('Folioport / pdf-lib');out.setCreationDate(new Date(0));out.setModificationDate(new Date(0));
 const embedded=await Promise.all(source.doc.getPages().map((page,i)=>{const b=source.info.boxes[i];return b.hasContent?out.embedPage(page,{left:b.x,bottom:b.y,right:b.x+b.width,top:b.y+b.height}):null}));
 for(const side of layout.sides){
  const page=out.addPage([geo.width,geo.height]);
  for(const [slotIndex,sourcePage] of [side.left,side.right].entries()){
   if(sourcePage===null){placements.push({side:side.number,slot:slotIndex,sourcePage:null});continue}
   const box=source.info.boxes[sourcePage-1],position=fit(box,geo.slots[slotIndex]);
   if(embedded[sourcePage-1])page.drawPage(embedded[sourcePage-1],{x:position.x,y:position.y,width:position.width,height:position.height});
   placements.push({side:side.number,slot:slotIndex,sourcePage,...position});
  }
 }
 const pdfBytes=await out.save({useObjectStreams:true,addDefaultPage:false});
 const reopened=await PDFDocument.load(pdfBytes,{updateMetadata:false});
 if(reopened.getPageCount()!==receipt.outputPages)throw Error('Generated PDF page-count verification failed.');
 return {settings:p,source:source.info,layout,audit:receipt,placements,pdfBytes};
}
export async function samplePDF(count=10){
 if(!Number.isInteger(count)||count<1||count>128)throw Error('Invalid sample count.');
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 doc.setTitle('Folioport numbered practice pages');doc.setCreationDate(new Date(0));doc.setModificationDate(new Date(0));
 for(let i=1;i<=count;i++){
  const page=doc.addPage([420,595]),dark=rgb(.13,.23,.36),accent=i%2?rgb(.78,.87,.95):rgb(.91,.81,.73);
  page.drawRectangle({x:0,y:0,width:420,height:595,color:rgb(.98,.98,.99)});
  page.drawRectangle({x:28,y:365,width:364,height:196,color:accent});
  page.drawText('TOP - KEEP UPRIGHT',{x:44,y:532,size:13,font:bold,color:dark});
  page.drawText(String(i),{x:44,y:400,size:110,font:bold,color:dark});
  page.drawText('Practice page '+i,{x:36,y:324,size:26,font:bold,color:dark});
  page.drawText('Folioport / numbered fold test',{x:36,y:291,size:15,font,color:dark});
  page.drawText('Print the imposed file at actual size.',{x:36,y:244,size:14,font,color:dark});
  page.drawText('Check both sides before folding.',{x:36,y:221,size:14,font,color:dark});
  page.drawText('Nest sheets within each signature.',{x:36,y:198,size:14,font,color:dark});
  page.drawText('Stack signatures in reading order.',{x:36,y:175,size:14,font,color:dark});
  page.drawLine({start:{x:36,y:110},end:{x:384,y:110},thickness:1,color:dark});
  page.drawText('BOTTOM / source '+i+' of '+count,{x:36,y:78,size:13,font,color:dark});
 }
 return doc.save();
}
