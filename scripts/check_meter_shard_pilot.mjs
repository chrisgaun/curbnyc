// Offline pilot only. Uses the active exact distance test after selecting cells.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {readPackedMeters} from '../meter-packed.js';
import {nearby} from '../meter-spatial.js';

async function verifyCells(folder,manifest,origin,radius,read=readFileSync){
 const [lng,lat]=origin;
 const dx=radius/(111320*Math.cos(lat*Math.PI/180)),dy=radius/111320;
 const cell=value=>Math.floor(value/manifest.step);
 const known=new Map();
 let transferred=0,downloads=0;
 for(let x=cell(lng-dx-1e-10);x<=cell(lng+dx+1e-10);x++){
  for(let y=cell(lat-dy-1e-10);y<=cell(lat+dy+1e-10);y++){
   const key=x+','+y,record=manifest.cells[key];
   if(!record)continue;
   const bytes=read(resolve(folder,key+'.bin.gz'));
   if(bytes.length!==record.bytes||createHash('sha256').update(bytes).digest('hex')!==record.sha256){
    throw Error('Incomplete or corrupt meter cell '+key);
   }
   const {metadata,features}=await readPackedMeters(new Response(bytes));
   if(metadata.version!==manifest.version||features.length!==record.count)throw Error('Wrong meter cell '+key);
   for(const feature of features){
    const id=Number(feature.properties.snapshot_ordinal);
    if(!Number.isSafeInteger(id)||id<0||id>=manifest.recordCount)throw Error('Invalid meter record ordinal');
    delete feature.properties.snapshot_ordinal;
    if(known.has(id))assert.deepEqual(feature,known.get(id));
    else known.set(id,feature);
   }
   transferred+=bytes.length;
   downloads++;
  }
 }
 const local=[...known.entries()].sort(([a],[b])=>a-b).filter(([,f])=>nearby(f,origin,radius));
 return {local,transferred,downloads};
}

const [snapshotPath,folder]=process.argv.slice(2);
if(!snapshotPath||!folder)throw Error('Usage: node scripts/check_meter_shard_pilot.mjs SNAPSHOT SHARD_DIRECTORY');
const canonical=JSON.parse(readFileSync(snapshotPath,'utf8'));
const manifestBytes=readFileSync(resolve(folder,'manifest.json'));
const manifest=JSON.parse(manifestBytes);
assert.equal(manifest.version,canonical.metadata.version);
assert.equal(manifest.recordCount,canonical.features.length);
assert.equal(manifest.step,0.02);
assert.ok(manifest.cells&&typeof manifest.cells==='object'&&!Array.isArray(manifest.cells));
const features=canonical.features.map(({the_geom,...properties},id)=>[id,{
 type:'Feature',geometry:the_geom,properties:Object.fromEntries(Object.entries(properties).filter(([,value])=>typeof value==='string'))
}]);
const locations=[
 ['Bryant Park',[-73.9832,40.7536]],['Times Square',[-73.9855,40.758]],
 ['Williamsburg',[-73.957,40.7148]],['Lower Manhattan',[-74.009,40.711]],
 ['Jackson Heights',[-73.891,40.749]],['No-meter control',[-73.75,40.56]]
];
const totals={cells:Object.keys(manifest.cells).length,manifestBytes:manifestBytes.length,
 assetBytes:Object.values(manifest.cells).reduce((sum,cell)=>sum+cell.bytes,0)};
console.log(totals);
for(const [name,origin] of locations){
 for(const radius of [250,500,800,1200]){
  const observed=await verifyCells(folder,manifest,origin,radius);
  assert.deepEqual(observed.local,features.filter(([,feature])=>nearby(feature,origin,radius)),name+' '+radius);
  console.log(name,radius,observed.local.length,observed.downloads,observed.transferred+manifestBytes.length);
 }
}
await assert.rejects(verifyCells(folder,manifest,locations[0][1],500,()=>{throw Error('Missing cell');}),/Missing cell/);
await assert.rejects(verifyCells(folder,manifest,locations[0][1],500,path=>{
 const damaged=readFileSync(path);
 damaged[0]^=1;
 return damaged;
}),/corrupt meter cell/);
console.log('24 exact parity checks passed. Missing and corrupt cells rejected.');
