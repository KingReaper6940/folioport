import {validate} from './model.mjs';
export function plan(pageCount,input){
 const settings=validate(input);if(!Number.isInteger(pageCount)||pageCount<1||pageCount>128)throw Error('PDF must contain 1–128 pages.');
 const capacity=settings.signature||Math.ceil(pageCount/4)*4,signatures=[],sides=[];let offset=0,sheet=0;
 while(offset<pageCount){
  const count=Math.min(capacity,pageCount-offset),padded=Math.ceil(count/4)*4,logical=Array.from({length:padded},(_,i)=>i<count?offset+i+1:null),number=signatures.length+1;
  signatures.push({number,start:offset+1,end:offset+count,padded,blanks:padded-count,sheets:padded/4});
  for(let i=0;i<padded/4;i++){
   sheet++;
   for(const [face,pair] of [['front',[logical[padded-1-2*i],logical[2*i]]],['back',[logical[2*i+1],logical[padded-2-2*i]]]]){
    const slots=settings.binding==='right'?pair.slice().reverse():pair;
    sides.push({number:sides.length+1,signature:number,sheet,face,left:slots[0],right:slots[1]});
   }
  }
  offset+=count;
 }
 return {settings,pageCount,signatures,sides,sheets:sheet,blanks:signatures.reduce((n,s)=>n+s.blanks,0)};
}
