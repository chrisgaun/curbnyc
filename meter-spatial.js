export function nearby(f,origin,radius){const scale=111320*Math.cos(origin[1]*Math.PI/180),sy=111320;const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates;for(const line of lines)for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],x=(a[0]-origin[0])*scale,y=(a[1]-origin[1])*sy,dx=(b[0]-a[0])*scale,dy=(b[1]-a[1])*sy;const t=Math.max(0,Math.min(1,-(x*dx+y*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(x+t*dx,y+t*dy)<=radius)return true;}return false;}

const cellSize=0.01;
const cell=value=>Math.floor(value/cellSize);

export function indexMeters(features){
 const grid=new Map(),large=[];
 for(const [id,feature] of features.entries()){
  const {type,coordinates}=feature.geometry;
  const lines=type==='LineString'?[coordinates]:coordinates;
  let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
  for(const line of lines)for(const [lng,lat] of line){
   west=Math.min(west,cell(lng));
   east=Math.max(east,cell(lng));
   south=Math.min(south,cell(lat));
   north=Math.max(north,cell(lat));
  }
  if((east-west+1)*(north-south+1)>64){
   large.push(id);
   continue;
  }
  for(let x=west;x<=east;x++)for(let y=south;y<=north;y++){
   const key=x+','+y;
   if(!grid.has(key))grid.set(key,[]);
   grid.get(key).push(id);
  }
 }
 return (origin,radius)=>{
  const [lng,lat]=origin;
  // Use the same local projection as the exact line distance check.
  const dx=radius/(111320*Math.cos(lat*Math.PI/180));
  const dy=radius/111320;
  const west=cell(lng-dx),east=cell(lng+dx),south=cell(lat-dy),north=cell(lat+dy);
  if(!Number.isFinite(dx)||east-west>64)return features.filter(f=>nearby(f,origin,radius));
  const candidates=new Set(large);
  for(let x=west;x<=east;x++)for(let y=south;y<=north;y++){
   for(const id of grid.get(x+','+y)??[])candidates.add(id);
  }
  // Keep inventory order for overlapping lines and equally ranked cards.
  return [...candidates].sort((a,b)=>a-b).map(id=>features[id]).filter(f=>nearby(f,origin,radius));
 };
}
