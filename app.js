import {category,distance} from './rules.js';
const $=id=>document.getElementById(id), status=$('status'), results=$('results');
const empty=()=>({type:'FeatureCollection',features:[]});
const attribution='NYC Open Data / Department of City Planning';
const map=new maplibregl.Map({container:'map',center:[-73.9832,40.7536],zoom:16,minZoom:14,maxZoom:19,style:{version:8,glyphs:'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',sources:{
 buildings:{type:'geojson',data:empty(),attribution},parks:{type:'geojson',data:empty(),attribution},streets:{type:'geojson',data:empty(),attribution},signs:{type:'geojson',data:empty()},focus:{type:'geojson',data:empty()}
},layers:[
 {id:'background',type:'background',paint:{'background-color':'#eeeee8'}},
 {id:'parks',type:'fill',source:'parks',paint:{'fill-color':'#c8dbc0'}},
 {id:'buildings',type:'fill',source:'buildings',paint:{'fill-color':'#d6d7d2','fill-outline-color':'#c7c9c3'}},
 {id:'road-outline',type:'line',source:'streets',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#d1d3cd','line-width':['interpolate',['linear'],['zoom'],14,5,16,15,19,65]}},
 {id:'roads',type:'line',source:'streets',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':['interpolate',['linear'],['zoom'],14,3,16,13,19,63]}},
 {id:'street-names',type:'symbol',source:'streets',layout:{'symbol-placement':'line','text-field':['coalesce',['get','street'],['get','stname'],['get','full_stree'],''],'text-font':['Open Sans Regular'],'text-size':11,'symbol-spacing':140},paint:{'text-color':'#505a5d','text-halo-color':'#ffffff','text-halo-width':1}},
 {id:'radius',type:'line',source:'focus',filter:['==',['geometry-type'],'Polygon'],paint:{'line-color':'#2563eb','line-opacity':0.4,'line-dasharray':[2,2]}},
 {id:'sign-points',type:'circle',source:'signs',paint:{'circle-radius':5,'circle-color':['get','color'],'circle-stroke-width':1.5,'circle-stroke-color':'#ffffff'}},
 {id:'location',type:'circle',source:'focus',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':7,'circle-color':'#2563eb','circle-stroke-color':'#ffffff','circle-stroke-width':2}}
]}});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
let center=[40.7536,-73.9832],generation=0,mapGeneration=0;
const mapStatus=$('map-status');
const point=(p,properties={})=>({type:'Feature',geometry:{type:'Point',coordinates:[p[1],p[0]]},properties});
function focus(origin,radius){const ring=Array.from({length:65},(_,i)=>{const a=i/64*Math.PI*2;return [origin[1]+Math.cos(a)*radius/(111320*Math.cos(origin[0]*Math.PI/180)),origin[0]+Math.sin(a)*radius/111320];});return {type:'FeatureCollection',features:[point(origin),{type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{}}]};}
async function refreshBasemap(){
 const id=++mapGeneration,b=map.getBounds(),west=b.getWest(),east=b.getEast(),north=b.getNorth(),south=b.getSouth();
 const polygon='MULTIPOLYGON ((('+west+' '+south+', '+east+' '+south+', '+east+' '+north+', '+west+' '+north+', '+west+' '+south+')))';
 const specs=[['streets','inkn-q76z',4000],['buildings','5zhs-2jue',8000],['parks','y6ja-fw4f',1000]];
 mapStatus.textContent='Loading official NYC geometry…';
 const outcome=await Promise.allSettled(specs.map(async ([name,dataset,limit])=>{const data=await get('/resource/'+dataset+'.geojson',{'$where':"intersects(the_geom, '"+polygon+"')",'$limit':String(limit)});if(data.type!=='FeatureCollection')throw Error('Unexpected geometry');if(id===mapGeneration)map.getSource(name).setData(data);return {name,truncated:data.features.length>=limit};}));
 if(id!==mapGeneration)return;
 const failures=outcome.flatMap((r,i)=>r.status==='rejected'?[specs[i][0]]:[]);
 const capped=outcome.some(r=>r.status==='fulfilled'&&r.value.truncated);
 if(failures.length)for(const name of failures)map.getSource(name).setData(empty());
 mapStatus.textContent=failures.length?'Map data unavailable: '+failures.join(', ')+'. Zoom in or retry.':capped?'Map geometry may be incomplete at this zoom.':'NYC street geometry · no business listings';
}
const colors={commercial:'#d97706',restriction:'#dc2626',meter:'#2563eb',unknown:'#64748b'};
const labels={commercial:'Commercial / loading sign',restriction:'Restriction sign',meter:'Meter sign',unknown:'Review sign'};
const base='https://data.cityofnewyork.us';
function localNow(){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());return parts.replace(' ','T');} $('arrival').value=localNow();
async function get(path,params={}){const u=new URL(base+path);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));const r=await fetch(u);if(!r.ok)throw Error('NYC data returned HTTP '+r.status);return r.json();}
function text(tag,value,parent){const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;}
async function search(){const id=++generation;const origin=[...center];const radius=Number($('radius').value);map.getSource('signs').setData(empty());results.replaceChildren();map.getSource('focus').setData(focus(origin,radius));if(origin[0]>40.8015||origin[0]<40.700||origin[1]<-74.025||origin[1]>-73.945){status.textContent='Outside initial Manhattan pilot bounding area. Try Bryant Park.';return;}status.textContent='Loading NYC DOT sign records…';try{
 const projection='+proj=lcc +lat_1=41.03333333333333 +lat_2=40.66666666666667 +lat_0=40.16666666666667 +lon_0=-74 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs';
 if(typeof proj4!=='function')throw Error('Coordinate converter could not load');
 const [x,y]=proj4('EPSG:4326',projection,[origin[1],origin[0]]);
 const buffer=radius/0.3048006096012192*1.02+10;
 const where="record_type = 'Current' AND borough = 'Manhattan' AND sign_x_coord between "+Math.floor(x-buffer)+" and "+Math.ceil(x+buffer)+" AND sign_y_coord between "+Math.floor(y-buffer)+" and "+Math.ceil(y+buffer);
 const rows=await get('/resource/nfid-uabd.json',{'$where':where,'$limit':'5000'});if(id!==generation)return;const entries=[];for(const row of rows){if(row.sign_x_coord==null||row.sign_y_coord==null)continue;const sx=Number(row.sign_x_coord),sy=Number(row.sign_y_coord);if(!Number.isFinite(sx)||!Number.isFinite(sy))continue;const [lon,lat]=proj4(projection,'EPSG:4326',[sx,sy]);const p=[lat,lon];if(!p.every(Number.isFinite)||distance(origin,p)>radius)continue;const description=row.sign_description||'No description';entries.push({p,description,d:distance(origin,p),row});}entries.sort((a,b)=>a.d-b.d);
 map.getSource('signs').setData({type:'FeatureCollection',features:entries.map(e=>point(e.p,{color:colors[category(e.description)],description:e.description,label:labels[category(e.description)]}))});
 status.textContent=entries.length+' nearby sign records'+(rows.length===5000?' (query limit reached; incomplete)':'')+'. Arrival and stay are planning inputs only; time rules are not evaluated yet.';
 for(const e of entries.slice(0,80)){const a=text('article','',results);text('strong',labels[category(e.description)]+' · '+Math.round(e.d)+' m',a);text('p',e.description,a);const street=Object.entries(e.row).filter(([k])=>/street|side_of/.test(k)).map(([k,v])=>k+': '+v).join(' · ');if(street)text('small',street,a);const b=text('button','Show on map',a);b.onclick=()=>map.flyTo({center:[e.p[1],e.p[0]],zoom:19});}
 }catch(e){if(id===generation)status.textContent='Could not load live signs: '+e.message+'. No parking conclusions available.';}}
map.once('load',()=>{function move(p){center=p;map.jumpTo({center:[p[1],p[0]],zoom:16});search();} $('bryant').onclick=()=>move([40.7536,-73.9832]);$('refresh').onclick=search;map.on('click',e=>{const hits=map.queryRenderedFeatures(e.point,{layers:['sign-points']});if(hits.length){const hit=hits[0],popup=document.createElement('div');text('strong',hit.properties.label,popup);text('p',hit.properties.description,popup);new maplibregl.Popup().setLngLat(hit.geometry.coordinates).setDOMContent(popup).addTo(map);return;}move([e.lngLat.lat,e.lngLat.lng]);});$('loc').onclick=()=>{if(!navigator.geolocation){status.textContent='Location unavailable';return;}navigator.geolocation.getCurrentPosition(p=>move([p.coords.latitude,p.coords.longitude]),e=>status.textContent='Location unavailable: '+e.message,{enableHighAccuracy:true,timeout:15000});};$('radius').onchange=search;refreshBasemap();search();map.on('moveend',refreshBasemap);});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
