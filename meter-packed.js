const magic=0x434d3031; // CM01

export function decodePackedMeters(bytes){
 const view=new DataView(bytes);
 if(view.byteLength<8||view.getUint32(0)!==magic)throw Error('Unknown compact meter format');
 const start=8+view.getUint32(4,true);
 if(start>view.byteLength)throw Error('Incomplete compact meter header');
 const {metadata,rows}=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes,8,start-8)));
 if(!Array.isArray(rows)||metadata?.recordCount!==rows.length)throw Error('Incomplete compact meter records');
 let points=0;
 for(const row of rows){
  if(!Array.isArray(row)||row.length!==3||typeof row[0]!=='boolean'||!Array.isArray(row[1])||
     !row[1].length||(row[0]&&row[1].length!==1)||!row[2]||typeof row[2]!=='object'||Array.isArray(row[2])||
     Object.values(row[2]).some(value=>typeof value!=='string')){
   throw Error('Invalid compact meter record');
  }
  for(const count of row[1]){
   if(!Number.isSafeInteger(count)||count<2)throw Error('Invalid compact meter line');
   points+=count;
  }
 }
 if(view.byteLength-start!==points*16)throw Error('Incomplete compact meter coordinates');

 const shuffled=new Uint8Array(bytes,start),scratch=new DataView(new ArrayBuffer(points*16));
 const restored=new Uint8Array(scratch.buffer);
 for(let axis=0;axis<2;axis++){
  for(let column=0;column<8;column++){
   const offset=(axis*8+column)*points;
   for(let i=0;i<points;i++)restored[axis*points*8+i*8+column]=shuffled[offset+i];
  }
 }
 let point=0;
 const features=rows.map(([lineString,counts,properties])=>{
  const lines=counts.map(count=>Array.from({length:count},()=>{
   const x=scratch.getFloat64(point*8,true);
   const y=scratch.getFloat64((point+points)*8,true);
   point++;
   if(!Number.isFinite(x)||Math.abs(x)>180||!Number.isFinite(y)||Math.abs(y)>90)throw Error('Invalid compact meter coordinate');
   return [x,y];
  }));
  return {type:'Feature',geometry:{type:lineString?'LineString':'MultiLineString',coordinates:lineString?lines[0]:lines},properties};
 });
 return {metadata,features};
}

export async function readPackedMeters(response){
 if(!response.body)throw Error('Compact meter response has no data');
 const stream=response.body.pipeThrough(new DecompressionStream('gzip'));
 return decodePackedMeters(await new Response(stream).arrayBuffer());
}
