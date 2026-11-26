const sources=[
 ['streets','inkn-q76z',4000],
 ['buildings','5zhs-2jue',8000],
 ['parks','y6ja-fw4f',1000]
];

function contains(outer,inner){
 return outer.w<=inner.w&&outer.e>=inner.e&&outer.s<=inner.s&&outer.n>=inner.n;
}

function requestURL(dataset,limit,{w,e,s,n}){
 const url=new URL('https://data.cityofnewyork.us/resource/'+dataset+'.geojson');
 url.searchParams.set('$where',`intersects(the_geom, 'MULTIPOLYGON (((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s})))')`);
 url.searchParams.set('$limit',String(limit));
 return url;
}

export function createBasemapLoader({getBounds,fetchGeometry,apply,report}){
 const layers=sources.map(([name,dataset,limit])=>({name,dataset,limit,cache:[]}));
 let timer,request;
 const cached=(layer,viewport)=>layer.cache.find(entry=>
  contains(entry.bounds,viewport)&&(!entry.capped||contains(viewport,entry.bounds)));
 const reportLayers=failed=>report(failed||layers.some(layer=>layer.shown?.capped)
  ?'Some background geometry unavailable; showing available data.'
  :'NYC street geometry · no business listings');
 function show(layer,entry){
  if(layer.shown!==entry)apply(layer.name,entry.data);
  layer.shown=entry;
  layer.cache=[entry,...layer.cache.filter(other=>other!==entry)].slice(0,2);
 }
 async function update(viewport,buffer){
  const controller=new AbortController();
  const coverage={...buffer};
  for(const layer of layers){
   const prior=cached(layer,viewport);
   if(!prior)continue;
   const bounds=prior.capped?viewport:prior.bounds;
   coverage.w=Math.max(coverage.w,bounds.w);
   coverage.e=Math.min(coverage.e,bounds.e);
   coverage.s=Math.max(coverage.s,bounds.s);
   coverage.n=Math.min(coverage.n,bounds.n);
  }
  const active={controller,viewport,coverage};
  request=active;
  const results=await Promise.allSettled(layers.map(async layer=>{
   const prior=cached(layer,viewport);
   if(prior){show(layer,prior);return;}
   const fetchBounds=async bounds=>{
    const data=await fetchGeometry(requestURL(layer.dataset,layer.limit,bounds),controller.signal);
    if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Invalid geometry');
    return data;
   };
   let bounds=buffer,data=await fetchBounds(bounds);
   // A capped response may omit features inside the current viewport.
   if(data.features.length>=layer.limit&&!controller.signal.aborted){
    bounds=active.viewport;
    active.coverage=bounds;
    data=await fetchBounds(bounds);
   }
   if(controller.signal.aborted)return;
   for(const feature of data.features){
    const p=feature.properties??{};
    feature.properties=layer.name==='streets'?{
     st_label:p.stname_label??p.st_label??p.street_name??p.street??p.full_street_name??p.full_stree??''
    }:{};
   }
   show(layer,{bounds,data,capped:data.features.length>=layer.limit});
  }));
  if(controller.signal.aborted)return;
  request=undefined;
  reportLayers(results.some(result=>result.status==='rejected'));
 }
 return ()=>{
  clearTimeout(timer);
  const bounds=getBounds();
  const viewport={w:bounds.getWest(),e:bounds.getEast(),s:bounds.getSouth(),n:bounds.getNorth()};
  if(request&&contains(request.coverage,viewport)){
   request.viewport=viewport;
   return;
  }
  request?.controller.abort();
  request=undefined;
  if(layers.every(layer=>cached(layer,viewport))){
   for(const layer of layers)show(layer,cached(layer,viewport));
   reportLayers(false);
   return;
  }
  const {w,e,s,n}=viewport,dx=(e-w)/4,dy=(n-s)/4;
  const buffer={w:w-dx,e:e+dx,s:s-dy,n:n+dy};
  timer=setTimeout(()=>void update(viewport,buffer),120);
 };
}
