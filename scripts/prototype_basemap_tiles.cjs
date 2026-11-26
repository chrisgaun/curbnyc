// Pilot only. Install geojson-vt and vt-pbf in a temporary directory and set NODE_PATH.
const fs=require('node:fs');
const path=require('node:path');
const geojsonvt=require('geojson-vt').default;
const {fromGeojsonVt}=require('vt-pbf');

const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/prototype_basemap_tiles.cjs INPUT_DIR OUTPUT_DIR');
const sourceNames=['streets','buildings','parks'];
const indexes=Object.fromEntries(sourceNames.map(name=>{
 const collection=JSON.parse(fs.readFileSync(path.join(input,name+'.geojson'),'utf8'));
 if(!collection.features.length)throw Error('Missing sample features for '+name);
 for(const feature of collection.features){
  const {stname_label,street_name,full_street_name}=feature.properties??{};
  feature.properties=name==='streets'?{st_label:stname_label??street_name??full_street_name??''}:{};
 }
 return [name,new geojsonvt(collection,{maxZoom:16,indexMaxZoom:14})];
}));
const bounds=[-73.993,40.746,-73.976,40.762];
function tileXY(lng,lat,z){
 const scale=2**z;
 return [Math.floor((lng+180)/360*scale),Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*scale)];
}
let tiles=0,bytes=0;
for(let z=14;z<=16;z++){
 const [left,bottom]=tileXY(bounds[0],bounds[1],z);
 const [right,top]=tileXY(bounds[2],bounds[3],z);
 for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++){
  const layers=Object.fromEntries(sourceNames.flatMap(name=>{
   const tile=indexes[name].getTile(z,x,y);
   return tile?[[name,tile]]:[];
  }));
  const data=fromGeojsonVt(layers,{version:2});
  const folder=path.join(output,String(z),String(x));
  fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,y+'.pbf'),data);
  tiles++;
  bytes+=data.length;
 }
}
console.log({tiles,bytes});
