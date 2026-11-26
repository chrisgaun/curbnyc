const key='curbnyc.map-preferences';
const radii=new Set(['250','500','800','1200']);

export function readMapPreferences(storage){
 try{
  const settings=JSON.parse((storage??globalThis.localStorage).getItem(key));
  return {
   radius:radii.has(settings?.radius)?settings.radius:'500',
   hideRestricted:typeof settings?.hideRestricted==='boolean'?settings.hideRestricted:true
  };
 }catch{
  return {radius:'500',hideRestricted:true};
 }
}

export function saveMapPreferences(settings,storage){
 try{
  (storage??globalThis.localStorage).setItem(key,JSON.stringify({
   radius:settings.radius,
   hideRestricted:settings.hideRestricted
  }));
 }catch{
  // The current controls work when storage is unavailable.
 }
}
