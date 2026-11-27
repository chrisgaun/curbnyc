const endpoint='https://geosearch.planninglabs.nyc/v2/search';
const boroughs=new Set(['Bronx','Brooklyn','Manhattan','Queens','Staten Island']);

export function searchURL(query){
 const url=new URL(endpoint);
 url.searchParams.set('text',query.trim());
 url.searchParams.set('size','5');
 return url;
}

export function searchResults(payload){
 if(payload?.type!=='FeatureCollection'||!Array.isArray(payload.features))throw Error('Invalid search response');
 const results=[],seen=new Set();
 for(const feature of payload.features){
  const p=feature?.properties,point=feature?.geometry;
  if(!p||!boroughs.has(p.borough)||point?.type!=='Point'||!Array.isArray(point.coordinates))continue;
  const [lng,lat]=point.coordinates;
  // The provider is NYC-only. Reject malformed and out-of-region points as well.
  if(!Number.isFinite(lng)||!Number.isFinite(lat)||lng < -74.27||lng > -73.68||lat < 40.48||lat > 40.93)continue;
  const label=typeof p.name==='string'&&p.name.trim()?p.name.trim():
   typeof p.label==='string'?p.label.trim():'';
  if(!label)continue;
  const key=[label.toLowerCase(),p.borough,lng,lat].join('|');
  if(seen.has(key))continue;
  seen.add(key);
  results.push({label,borough:p.borough,center:[lng,lat]});
  if(results.length===5)break;
 }
 return results;
}

export function setupDestinationSearch({open,dialog,form,input,status,results,close,onSelect}){
 let request;
 const clean=()=>{
  request?.abort();
  request=undefined;
  input.value='';
  status.textContent='';
  results.replaceChildren();
 };
 open.addEventListener('click',()=>{
  clean();
  dialog.showModal();
 });
 close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{if(!dialog.open)clean();});

 input.addEventListener('input',()=>{
  request?.abort();
  request=undefined;
  status.textContent='';
  results.replaceChildren();
 });

 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const query=input.value.trim();
  if(query.length<3){
   status.textContent='Enter at least 3 characters.';
   input.focus();
   return;
  }
  request?.abort();
  const controller=new AbortController();
  request=controller;
  const timeout=setTimeout(()=>controller.abort(),8000);
  results.replaceChildren();
  status.textContent='Searching NYC addresses…';
  try{
   const response=await fetch(searchURL(query),{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
   if(!response.ok)throw Error('Search unavailable');
   const matches=searchResults(await response.json());
   if(request!==controller||!dialog.open)return;
   status.textContent=matches.length?'Choose an address.':'No matching NYC addresses. Try adding a borough.';
   for(const result of matches){
    const item=document.createElement('li');
    const button=document.createElement('button');
    button.type='button';
    button.textContent=result.label+' · '+result.borough;
    button.addEventListener('click',()=>{
     onSelect(result);
     dialog.close();
    });
    item.append(button);
    results.append(item);
   }
  }catch{
   if(request===controller&&dialog.open)status.textContent='Address search unavailable. Try again or browse the map.';
  }finally{
   clearTimeout(timeout);
   if(request===controller)request=undefined;
  }
 });
}
