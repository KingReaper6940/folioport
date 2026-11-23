import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFName,PDFNumber,PDFDict,PDFArray,PDFRawStream,StandardFonts,degrees,decodePDFRawStream} from 'pdf-lib';
import {samplePDF,inspectPDF,impose} from '../src/pdf.mjs';
import {example} from '../src/example.mjs';
async function numbered(count){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
 for(let i=1;i<=count;i++)doc.addPage([300,500]).drawText('PAGE_'+i,{x:20,y:200,font,size:20});
 return doc.save();
}
function content(doc,page){
 const contents=page.node.Contents(),parts=contents instanceof PDFArray?contents.asArray():[contents];
 return parts.filter(Boolean).map(ref=>new TextDecoder().decode(decodePDFRawStream(doc.context.lookup(ref,PDFRawStream)).decode())).join('\n');
}
test('actual PDF preflight records page geometry, immutable bytes and SHA-256',async()=>{
 const bytes=await numbered(3),before=Uint8Array.from(bytes),info=await inspectPDF(bytes,'three.pdf');
 assert.equal(info.pages,3);assert.equal(info.sha256.length,64);assert.equal(info.boxes[0].width,300);assert.deepEqual(bytes,before);
});
test('actual imposed PDF embeds the expected source artwork in left/right draw order',async()=>{
 const bytes=await numbered(8),r=await impose(bytes,example,'eight.pdf'),out=await PDFDocument.load(r.pdfBytes);
 assert.equal(out.getPageCount(),4);
 const expected=[[8,1],[2,7],[6,3],[4,5]];
 for(const [i,page] of out.getPages().entries()){
  const stream=content(out,page),names=[...stream.matchAll(/\/([A-Za-z0-9-]+) Do/g)].map(m=>m[1]),objects=page.node.Resources().lookup(PDFName.of('XObject'),PDFDict);
  assert.equal(names.length,2);
  for(let j=0;j<2;j++){
   const object=out.context.lookup(objects.get(PDFName.of(names[j])),PDFRawStream),text=new TextDecoder().decode(decodePDFRawStream(object).decode()).toLowerCase();
   assert.ok(text.includes(Buffer.from('PAGE_'+expected[i][j]).toString('hex')),i+':'+j);
  }
 }
 assert.deepEqual(r.audit.foldedReadingOrder,[1,2,3,4,5,6,7,8]);
});
test('actual right-binding output and explicit blank panels keep exact page counts',async()=>{
 const r=await impose(await numbered(5),{...example,binding:'right'}),doc=await PDFDocument.load(r.pdfBytes);
 assert.equal(doc.getPageCount(),4);assert.equal(r.audit.blankPanels,3);assert.equal(r.placements.filter(p=>p.sourcePage===null).length,3);assert.deepEqual(r.layout.sides[0].left,1);
});
test('source crop offsets are used and blank source pages remain distinguishable from padding',async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage([600,800]);page.setCropBox(100,120,400,500);page.drawRectangle({x:120,y:140,width:30,height:50});doc.addPage([300,400]);
 const r=await impose(await doc.save(),example);
 assert.deepEqual(r.source.boxes[0],{x:100,y:120,width:400,height:500,hasContent:true});assert.equal(r.source.boxes[1].hasContent,false);assert.equal(r.audit.sourcePages,2);assert.equal(r.audit.blankPanels,2);
 assert.equal((await PDFDocument.load(r.pdfBytes)).getPageCount(),2);
});
test('reject malformed, over-limit, rotated and unusual-unit source PDFs',async()=>{
 await assert.rejects(()=>inspectPDF(new Uint8Array([1,2,3])),/Cannot read/);await assert.rejects(()=>inspectPDF(new Uint8Array(10*1024*1024+1)),/10 MiB/);
 const rotated=await PDFDocument.create();rotated.addPage([300,400]).setRotation(degrees(90));await assert.rejects(async()=>inspectPDF(await rotated.save()),/Rotate/);
 const unit=await PDFDocument.create();unit.addPage([300,400]).node.set(PDFName.of('UserUnit'),PDFNumber.of(2));await assert.rejects(async()=>inspectPDF(await unit.save()),/UserUnit/);
 const tooMany=await PDFDocument.create();for(let i=0;i<129;i++)tooMany.addPage([300,400]);await assert.rejects(async()=>inspectPDF(await tooMany.save()),/1–128/);
});
test('interactive fields and orphan widgets are rejected rather than silently flattened',async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage([300,400]);doc.getForm().createTextField('name').addToPage(page);await assert.rejects(async()=>inspectPDF(await doc.save()),/Interactive forms/);
 const orphan=await PDFDocument.create(),p=orphan.addPage([300,400]),widget=orphan.context.obj({Type:'Annot',Subtype:'Widget',Rect:[0,0,20,20]});p.node.set(PDFName.of('Annots'),orphan.context.obj([orphan.context.register(widget)]));
 await assert.rejects(async()=>inspectPDF(await orphan.save()),/widgets/);
});
test('non-widget annotations are counted and not copied into imposed pages',async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage([300,400]);page.drawRectangle({x:10,y:10,width:20,height:30});const link=doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[0,0,20,20]});page.node.set(PDFName.of('Annots'),doc.context.obj([doc.context.register(link)]));
 const r=await impose(await doc.save(),example);assert.equal(r.source.annotations,1);for(const p of (await PDFDocument.load(r.pdfBytes)).getPages())assert.ok(!p.node.Annots()?.size());
});
test('generated numbered practice PDF exercises a real multi-signature output',async()=>{
 const r=await impose(await samplePDF(),example,'numbered-practice.pdf');assert.equal(r.source.pages,10);assert.equal(r.audit.outputPages,6);assert.equal(r.audit.blankPanels,2);assert.ok(r.pdfBytes.length>1000);
});
