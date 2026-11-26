import {assess,aggregate} from './schedule.js';
import {category,distance} from './rules.js';
const $=id=>document.getElementById(id), status=$('status'), results=$('results');
const empty=()=>({type:'FeatureCollection',features:[]});
const attribution='NYC Open Data / Department of City Planning';
const map=new maplibregl.Map({container:'map',center:[-73.9832,40.7536],zoom:16,minZoom:14,maxZoom:19,style:{version:8,glyphs:'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',sources:{
 buildings:{type:'geojson',data:empty(),attribution},parks:{type:'geojson',data:empty(),attribution},streets:{type:'geojson',data:empty(),attribution},signs:{type:'geojson',data:empty()},opportunities:{type:'geojson',data:empty()},meters:{type:'geojson',data:empty(),attribution:'NYC DOT ParkNYC'},focus:{type:'geojson',data:empty()}
},layers:[
 {id:'background',type:'background',paint:{'background-color':'#eeeee8'}},
 {id:'parks',type:'fill',source:'parks',paint:{'fill-color':'#c8dbc0'}},
 {id:'buildings',type:'fill',source:'buildings',paint:{'fill-color':'#d6d7d2','fill-outline-color':'#c7c9c3'}},
 {id:'road-outline',type:'line',source:'streets',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#d1d3cd','line-width':['interpolate',['linear'],['zoom'],14,5,16,15,19,65]}},
 {id:'roads',type:'line',source:'streets',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':['interpolate',['linear'],['zoom'],14,3,16,13,19,63]}},
 {id:'street-names',type:'symbol',source:'streets',layout:{'symbol-placement':'line','text-field':['coalesce',['get','st_label'],['get','full_stree'],['get','street'],['get','st_name'],['get','stname'],''],'text-font':['Open Sans Regular'],'text-size':11,'symbol-spacing':140},paint:{'text-color':'#505a5d','text-halo-color':'#ffffff','text-halo-width':1}},
 {id:'radius',type:'line',source:'focus',filter:['==',['geometry-type'],'Polygon'],paint:{'line-color':'#2563eb','line-opacity':0.4,'line-dasharray':[2,2]}},
 {id:'meter-blockfaces',type:'line',source:'meters',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#788ba5','line-width':4,'line-opacity':0.85}},
 {id:'opportunity-lines',type:'line',source:'opportunities',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':5,'line-offset':['get','offset']}},
 {id:'sign-points',type:'circle',source:'signs',layout:{visibility:'none'},paint:{'circle-radius':5,'circle-color':['get','color'],'circle-stroke-width':1.5,'circle-stroke-color':'#ffffff'}},
 {id:'location',type:'circle',source:'focus',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':7,'circle-color':'#2563eb','circle-stroke-color':'#ffffff','circle-stroke-width':2}}
]}});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
let center=[40.7536,-73.9832],generation=0,mapGeneration=0,streetData=empty(),lastEntries=[],complete=false;
const mapStatus=$('map-status');
const point=(p,properties={})=>({type:'Feature',geometry:{type:'Point',coordinates:[p[1],p[0]]},properties});
function focus(origin,radius){const ring=Array.from({length:65},(_,i)=>{const a=i/64*Math.PI*2;return [origin[1]+Math.cos(a)*radius/(111320*Math.cos(origin[0]*Math.PI/180)),origin[0]+Math.sin(a)*radius/111320];});return {type:'FeatureCollection',features:[point(origin),{type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{}}]};}
async function refreshBasemap(){
 const id=++mapGeneration,b=map.getBounds(),west=b.getWest(),east=b.getEast(),north=b.getNorth(),south=b.getSouth();
 const polygon='MULTIPOLYGON ((('+west+' '+south+', '+east+' '+south+', '+east+' '+north+', '+west+' '+north+', '+west+' '+south+')))';
 const specs=[['streets','inkn-q76z',4000],['buildings','5zhs-2jue',8000],['parks','y6ja-fw4f',1000]];
 mapStatus.textContent='Loading official NYC geometry…';
 const outcome=await Promise.allSettled(specs.map(async ([name,dataset,limit])=>{const data=await get('/resource/'+dataset+'.geojson',{'$where':"intersects(the_geom, '"+polygon+"')",'$limit':String(limit)});if(data.type!=='FeatureCollection')throw Error('Unexpected geometry');if(id===mapGeneration){map.getSource(name).setData(data);if(name==='streets')streetData=data;}return {name,truncated:data.features.length>=limit};}));
 if(id!==mapGeneration)return;
 const failures=outcome.flatMap((r,i)=>r.status==='rejected'?[specs[i][0]]:[]);
 const capped=outcome.some(r=>r.status==='fulfilled'&&r.value.truncated);
 if(failures.length)for(const name of failures){map.getSource(name).setData(empty());if(name==='streets')streetData=empty();}renderOpportunities();
 mapStatus.textContent=failures.length?'Map data unavailable: '+failures.join(', ')+'. Zoom in or retry.':capped?'Map geometry may be incomplete at this zoom.':'NYC street geometry · no business listings';
}
const colors={commercial:'#d97706',restriction:'#dc2626',meter:'#2563eb',unknown:'#64748b'};
const labels={commercial:'Commercial / loading sign',restriction:'Restriction sign',meter:'Meter sign',unknown:'Review sign'};
const base='https://data.cityofnewyork.us';
function localNow(){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());return parts.replace(' ','T');} $('arrival').value=localNow();
async function get(path,params={}){const u=new URL(base+path);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));const r=await fetch(u,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('NYC data returned HTTP '+r.status);return r.json();}
function text(tag,value,parent){const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;}
let meterGeneration=0;
async function loadMeters(origin,radius){const id=++meterGeneration;const note=$('meter-status');map.getSource('meters').setData(empty());note.textContent='Loading city meter blockfaces…';try{const dy=radius/111000,dx=dy/Math.cos(origin[0]*Math.PI/180),w=origin[1]-dx,e=origin[1]+dx,n=origin[0]+dy,s=origin[0]-dy;const polygon='MULTIPOLYGON ((('+w+' '+s+', '+e+' '+s+', '+e+' '+n+', '+w+' '+n+', '+w+' '+s+')))';const data=await get('/resource/e7yp-wx55.geojson',{'$where':"intersects(the_geom, '"+polygon+"')",'$limit':'2000'});if(id!==meterGeneration)return;if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Unexpected meter geometry');const features=data.features.filter(f=>['LineString','MultiLineString'].includes(f.geometry?.type)).map(f=>{const p=f.properties||{};return {...f,properties:{label:'Official meter blockface — check restrictions',description:[p.on_street,p.side_of_st,p.from_stree,p.to_street,p.vehicle_ty,...Object.keys(p).filter(k=>/^all_vehicl$|^all_vehi_\d$|^commercial$|^commerci_\d$/.test(k)).map(k=>p[k])].filter(Boolean).join(' · ')+' | Meter inventory only; not a time-aware parking recommendation.'}};});map.getSource('meters').setData({type:'FeatureCollection',features});note.textContent=features.length+' city meter blockfaces (muted blue-gray; check posted restrictions).'+(data.features.length>=2000?' Results may be incomplete.':'');}catch(e){if(id===meterGeneration)note.textContent='Meter data unavailable: '+e.message;}}
async function search(){const id=++generation;const origin=[...center];const radius=Number($('radius').value);complete=false;lastEntries=[];map.getSource('opportunities').setData(empty());map.getSource('meters').setData(empty());++meterGeneration;$('meter-status').textContent='';map.getSource('signs').setData(empty());results.replaceChildren();map.getSource('focus').setData(focus(origin,radius));if(origin[0]>40.8015||origin[0]<40.700||origin[1]<-74.025||origin[1]>-73.945){status.textContent='Outside initial Manhattan pilot bounding area. Try Bryant Park.';return;}loadMeters(origin,radius);status.textContent='Loading NYC DOT sign records…';try{
 const projection='+proj=lcc +lat_1=41.03333333333333 +lat_2=40.66666666666667 +lat_0=40.16666666666667 +lon_0=-74 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs';
 if(typeof proj4!=='function')throw Error('Coordinate converter could not load');
 const [x,y]=proj4('EPSG:4326',projection,[origin[1],origin[0]]);
 const buffer=(radius+300)/0.3048006096012192*1.02+10;
 const where="record_type = 'Current' AND borough = 'Manhattan' AND sign_x_coord between "+Math.floor(x-buffer)+" and "+Math.ceil(x+buffer)+" AND sign_y_coord between "+Math.floor(y-buffer)+" and "+Math.ceil(y+buffer);
 const rows=await get('/resource/nfid-uabd.json',{'$where':where,'$limit':'5000'});if(id!==generation)return;const entries=[];for(const row of rows){if(row.sign_x_coord==null||row.sign_y_coord==null)continue;const sx=Number(row.sign_x_coord),sy=Number(row.sign_y_coord);if(!Number.isFinite(sx)||!Number.isFinite(sy))continue;const [lon,lat]=proj4(projection,'EPSG:4326',[sx,sy]);const p=[lat,lon];if(!p.every(Number.isFinite)||distance(origin,p)>radius+300)continue;const description=row.sign_description||'No description';entries.push({p,description,d:distance(origin,p),row});}entries.sort((a,b)=>a.d-b.d);
 map.getSource('signs').setData({type:'FeatureCollection',features:entries.map(e=>point(e.p,{color:colors[category(e.description)],description:e.description,label:labels[category(e.description)]}))});
 lastEntries=entries;complete=rows.length<5000;renderOpportunities();
 }catch(e){if(id===generation)status.textContent='Could not load live signs: '+e.message+'. No parking conclusions available.';}}
const normalize=v=>String(v||'').toUpperCase().replace(/\bWEST\b/g,'W').replace(/\bEAST\b/g,'E').replace(/\bSTREET\b/g,'ST').replace(/\bAVENUE\b/g,'AVE').replace(/(\d+)(ST|ND|RD|TH)\b/g,'$1').replace(/[^A-Z0-9]/g,'');
function renderOpportunities(){
 if(!complete){if(lastEntries.length)status.textContent='Sign query incomplete ('+lastEntries.length+' records); no parking hints shown. Try a smaller radius.';return;}
 const arrival=$('arrival').value,stay=Number($('stay').value),radius=Number($('radius').value);
 const streetIndex=new Map();
 for(const f of streetData.features){const name=f.properties.st_label||f.properties.full_stree||f.properties.street||f.properties.st_name||f.properties.stname;const key=normalize(name);if(!key)continue;const lines=f.geometry?.type==='MultiLineString'?f.geometry.coordinates:f.geometry?.type==='LineString'?[f.geometry.coordinates]:[];for(const coords of lines){if(coords.length<2)continue;const item={coords,name,groups:{left:[],right:[]}};if(!streetIndex.has(key))streetIndex.set(key,[]);streetIndex.get(key).push(item);}}
 const scale=Math.cos(center[0]*Math.PI/180);
 function closest(p,coords){let best={d:Infinity};for(let i=1;i<coords.length;i++){const a=coords[i-1],b=coords[i],dx=(b[0]-a[0])*scale,dy=b[1]-a[1],x=(p[1]-a[0])*scale,y=p[0]-a[1],len=dx*dx+dy*dy;if(!len)continue;const t=Math.max(0,Math.min(1,(x*dx+y*dy)/len));const d=Math.hypot(x-t*dx,y-t*dy)*111320;if(d<best.d)best={d,side:dx*y-dy*x>0?'left':'right',normal:[-dy,dx],t};}return best;}
 for(const e of lastEntries){const options=streetIndex.get(normalize(e.row.on_street))||[];let best=null,second=Infinity;for(const item of options){const m=closest(e.p,item.coords);if(!best||m.d<best.d){if(best)second=best.d;best={...m,item};}else second=Math.min(second,m.d);}if(!best||best.d<2||best.d>24||second-best.d<5)continue;
 const side=String(e.row.side_of_street||'').toUpperCase().trim(),n=best.normal.map(v=>best.side==='left'?v:-v);
 const cardinal=Math.abs(n[0])>Math.abs(n[1])?(n[0]>0?'E':'W'):(n[1]>0?'N':'S');
 if(!side||side[0]!==cardinal)continue;best.item.groups[best.side].push(e);}
 const features=[],counts={candidate:0,meter:0,avoid:0,unknown:0};let matched=0;results.replaceChildren();
 for(const items of streetIndex.values())for(const item of items)for(const side of ['left','right']){
 const entries=item.groups[side];if(!entries.length||!entries.some(e=>e.d<=radius))continue;
 // Do not infer an entire long street or a block without matched signs.
 const length=item.coords.slice(1).reduce((sum,p,i)=>sum+distance([p[1],p[0]],[item.coords[i][1],item.coords[i][0]]),0);
 if(length>250||item.coords.some(p=>distance(center,[p[1],p[0]])>radius+250))continue;
 matched+=entries.length;const state=aggregate(entries.map(e=>assess(e.description,arrival,stay)));counts[state]++;
 if((state==='unknown'&&!$('show-unknown').checked)||(state==='avoid'&&!$('show-avoid').checked))continue;
 const label={candidate:'Worth checking: matched restrictions appear inactive',meter:'Possible metered parking',avoid:'Matched restriction may apply',unknown:'Unresolved parking rules'}[state];
 features.push({type:'Feature',geometry:{type:'LineString',coordinates:item.coords},properties:{color:{candidate:'#329668',meter:'#3477ce',avoid:'#c94b4b',unknown:'#858b94'}[state],offset:side==='left'?-6:6,label,description:item.name+' · '+entries.length+' matched signs. Approximate block side; check all posted rules.\n'+[...new Set(entries.map(e=>e.description))].join('\n')}});
 }
 map.getSource('opportunities').setData({type:'FeatureCollection',features});
 status.textContent=counts.candidate+' promising · '+counts.meter+' possible metered · '+counts.unknown+' unresolved block sides. '+lastEntries.length+' sign records, '+matched+' matched to nearby block sides, '+streetData.features.length+' street features loaded.';if(!features.length){if(lastEntries.length&&matched===0){$('show-signs').checked=true;map.setLayoutProperty('sign-points','visibility','visible');}const a=text('article','',results);text('strong','No parking hints to display',a);text('p',lastEntries.length===0?'No sign records returned. Check the data connection and search location.':matched===0?'Signs loaded but none passed street-side matching.':'Matched signs did not yield a visible parking hint. Enable unresolved or restricted sides to inspect.',a);const b=text('button','Inspect raw signs',a);b.onclick=()=>{$('show-signs').checked=true;map.setLayoutProperty('sign-points','visibility','visible');};}
}
map.once('load',()=>{function move(p){center=p;map.jumpTo({center:[p[1],p[0]],zoom:16});search();} $('bryant').onclick=()=>move([40.7536,-73.9832]);$('refresh').onclick=search;map.on('click',e=>{const hits=map.queryRenderedFeatures(e.point,{layers:$('show-signs').checked?['sign-points','opportunity-lines','meter-blockfaces']:['opportunity-lines','meter-blockfaces']});if(hits.length){const hit=hits[0],popup=document.createElement('div');text('strong',hit.properties.label,popup);text('p',hit.properties.description,popup);new maplibregl.Popup().setLngLat(e.lngLat).setDOMContent(popup).addTo(map);return;}move([e.lngLat.lat,e.lngLat.lng]);});$('loc').onclick=()=>{if(!navigator.geolocation){status.textContent='Location unavailable';return;}navigator.geolocation.getCurrentPosition(p=>move([p.coords.latitude,p.coords.longitude]),e=>status.textContent='Location unavailable: '+e.message,{enableHighAccuracy:true,timeout:15000});};$('radius').onchange=search;$('arrival').onchange=renderOpportunities;$('stay').onchange=renderOpportunities;$('show-avoid').onchange=renderOpportunities;$('show-unknown').onchange=renderOpportunities;$('show-signs').onchange=()=>map.setLayoutProperty('sign-points','visibility',$('show-signs').checked?'visible':'none');$('now').onclick=()=>{$('arrival').value=localNow();renderOpportunities();};refreshBasemap();search();map.on('moveend',refreshBasemap);});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
