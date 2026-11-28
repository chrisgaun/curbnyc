const key='curbnyc.map-preferences';
const themes=new Set(['system','light','dark']);
const radii=new Set(['250','500','800','1200']);

export function readMapPreferences(storage){
 try{
  const settings=JSON.parse((storage??globalThis.localStorage).getItem(key));
  return {
   radius:radii.has(settings?.radius)?settings.radius:'500',
   hideRestricted:typeof settings?.hideRestricted==='boolean'?settings.hideRestricted:true,
   theme:themes.has(settings?.theme)?settings.theme:'system'
  };
 }catch{
  return {radius:'500',hideRestricted:true,theme:'system'};
 }
}

export function saveMapPreferences(settings,storage){
 try{
  (storage??globalThis.localStorage).setItem(key,JSON.stringify({
   radius:settings.radius,
   hideRestricted:settings.hideRestricted,
   theme:themes.has(settings.theme)?settings.theme:'system'
  }));
 }catch{
  // The current controls work when storage is unavailable.
 }
}
