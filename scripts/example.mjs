import {mkdir,writeFile} from 'node:fs/promises';
import {samplePDF,impose} from '../src/pdf.mjs';
import {example} from '../src/example.mjs';
import {settingsJSON,reportJSON,orderCSV,guideHTML,mapSVG} from '../src/exports.mjs';
const out=new URL('../examples/',import.meta.url);await mkdir(out,{recursive:true});const source=await samplePDF(),r=await impose(source,example,'numbered-practice.pdf');
for(const [name,data] of [['numbered-practice.pdf',source],['booklet.pdf',r.pdfBytes],['settings.json',settingsJSON(r)],['receipt.json',reportJSON(r)],['order.csv',orderCSV(r)],['guide.html',guideHTML(r)],['order-map.svg',mapSVG(r)]])await writeFile(new URL(name,out),data);
console.log('Wrote seven complete synthetic artifacts.');console.log(r.audit);
