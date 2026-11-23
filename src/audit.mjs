import {validate} from './model.mjs';
export function audit(plan){
 const p=validate(plan.settings),n=plan.pageCount;
 if(!Number.isInteger(n)||n<1||n>128||!Array.isArray(plan.sides)||plan.sides.length>64||!Array.isArray(plan.signatures))throw Error('Invalid imposition plan.');
 const seen=[],reading=[],blanks=[];let expectedPage=1,globalSheet=0,sideIndex=0;
 for(let index=0;index<plan.signatures.length;index++){
  const sig=plan.signatures[index],capacity=p.signature||Math.ceil(n/4)*4,count=Math.min(capacity,n-expectedPage+1),total=Math.ceil(count/4)*4;
  if(count<1||sig.number!==index+1||sig.start!==expectedPage||sig.end!==expectedPage+count-1||sig.padded!==total||sig.sheets!==total/4||sig.blanks!==total-count)throw Error('Signature coverage or padding failed.');
  const folded=Array(total).fill(undefined);
  for(let local=0;local<total/4;local++){
   globalSheet++;
   for(const face of ['front','back']){
    const side=plan.sides[sideIndex++];
    if(!side||side.number!==sideIndex||side.signature!==sig.number||side.sheet!==globalSheet||side.face!==face)throw Error('Sheet side order failed.');
    const slots=p.binding==='right'?[side.right,side.left]:[side.left,side.right];
    // Place viewed panels into their positions in the folded reading sequence.
    const locations=face==='front'?[total-1-2*local,2*local]:[2*local+1,total-2-2*local];
    slots.forEach((value,j)=>{if(value!==null&&(!Number.isInteger(value)||value<1||value>n))throw Error('Invalid source page.');folded[locations[j]]=value;if(value!==null)seen.push(value);else blanks.push(side.number)});
   }
  }
  const wanted=Array.from({length:total},(_,i)=>i<count?expectedPage+i:null);
  if(folded.some((v,i)=>v!==wanted[i]))throw Error('Folded page order failed.');
  reading.push(...folded);expectedPage+=count;
 }
 if(expectedPage!==n+1||sideIndex!==plan.sides.length||globalSheet!==plan.sheets||blanks.length!==plan.blanks||seen.length!==n||new Set(seen).size!==n)throw Error('Page coverage/count audit failed.');
 return {verified:true,sourcePages:n,paddedPages:reading.length,blankPanels:blanks.length,sheets:globalSheet,outputPages:sideIndex,foldedReadingOrder:reading};
}
