export const MM=72/25.4;
export const PAPERS=Object.freeze({a4:[297*MM,210*MM],letter:[792,612]});
export const MAX_BYTES=10*1024*1024;
export function validate(p){
 const keys=['schema','title','paper','signature','margin','gutter','binding','notes'];
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join('|')!==keys.sort().join('|')||p.schema!=='folioport/1')throw Error('Expected Folioport version 1 settings.');
 for(const [key,max] of [['title',100],['notes',4000]])if(typeof p[key]!=='string'||p[key].length>max||!p[key].isWellFormed())throw Error(key+' exceeds its text limit or contains an unpaired surrogate.');
 if(!Object.hasOwn(PAPERS,p.paper)||!['left','right'].includes(p.binding))throw Error('Choose a supported sheet size and binding.');
 if(!Number.isInteger(p.signature)||p.signature<0||p.signature>128||p.signature%4!==0)throw Error('Signature must be 0 (one booklet), or a multiple of 4 from 4 to 128.');
 for(const key of ['margin','gutter'])if(!Number.isFinite(p[key])||p[key]<0||p[key]>20)throw Error(key+' must be from 0 to 20 mm.');
 return structuredClone(p);
}
export function geometry(input){
 const p=validate(input),[width,height]=PAPERS[p.paper],m=p.margin*MM,g=p.gutter*MM;
 return {width,height,slots:[{x:m,y:m,width:(width-2*m-g)/2,height:height-2*m},{x:(width+g)/2,y:m,width:(width-2*m-g)/2,height:height-2*m}]};
}
export function fit(box,slot){
 const scale=Math.min(slot.width/box.width,slot.height/box.height);
 return {x:slot.x+(slot.width-box.width*scale)/2,y:slot.y+(slot.height-box.height*scale)/2,width:box.width*scale,height:box.height*scale,scale};
}
export function page(items,n,size=12){const pages=Math.max(1,Math.ceil(items.length/size)),current=Math.max(0,Math.min(Number.isInteger(n)?n:0,pages-1));return {items:items.slice(current*size,(current+1)*size),current,pages}}
