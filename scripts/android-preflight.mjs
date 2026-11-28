import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

const relation='delegate_permission/common.handle_all_urls';
const packagePattern=/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const fingerprintPattern=/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;

export function releaseInputs(site,packageName,fingerprint){
 const url=new URL(site);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||!url.pathname.endsWith('/')){
  throw Error('Use a public HTTPS web app URL ending in / without credentials, query, or fragment.');
 }
 if(Boolean(packageName)!==Boolean(fingerprint))throw Error('Supply the package name and Play signing fingerprint together.');
 const normalized=fingerprint?.toUpperCase();
 if(packageName&&(!packagePattern.test(packageName)||!fingerprintPattern.test(normalized))){
  throw Error('Use an Android package name and a colon-separated SHA-256 fingerprint.');
 }
 return {url,packageName,fingerprint:normalized};
}

export function matchingAssociation(statements,packageName,fingerprint){
 if(!Array.isArray(statements))return false;
 return statements.some(statement=>{
  const target=statement?.target;
  return Array.isArray(statement?.relation)&&statement.relation.includes(relation)&&
   target?.namespace==='android_app'&&target.package_name===packageName&&
   Array.isArray(target.sha256_cert_fingerprints)&&target.sha256_cert_fingerprints.some(value=>
    typeof value==='string'&&value.toUpperCase()===fingerprint);
 });
}

export function validateManifest(manifest,manifestURL,site){
 if(manifest?.display!=='standalone'||typeof manifest.name!=='string'||!manifest.name.trim()||
    typeof manifest.short_name!=='string'||!manifest.short_name.trim())return false;
 const paths=[manifest.start_url,manifest.scope,manifest.id??manifest.start_url];
 if(!paths.every(value=>typeof value==='string'&&value))return false;
 const icons=Array.isArray(manifest.icons)?manifest.icons:[];
 const resolvePath=path=>{
  try{return new URL(path,manifestURL);}catch{return null;}
 };
 const hasIcon=(purpose,size)=>icons.some(icon=>{
  if(icon?.type!=='image/png'||typeof icon.sizes!=='string'||typeof icon.src!=='string'||!icon.src)return false;
  const purposes=typeof icon.purpose==='string'?icon.purpose.split(/\s+/):['any'];
  return purposes.includes(purpose)&&icon.sizes.split(/\s+/).includes(size)&&
   resolvePath(icon.src)?.origin===site.origin;
 });
 return paths.every(path=>resolvePath(path)?.href===site.href)&&
  hasIcon('any','192x192')&&hasIcon('any','512x512')&&hasIcon('maskable','512x512');
}

export async function assessAndroidRelease(input,fetcher=fetch){
 const {url,packageName,fingerprint}=input;
 const manifestURL=new URL('manifest.json',url);
 const associationURL=new URL('/.well-known/assetlinks.json',url);
 const get=resource=>fetcher(resource,{redirect:'manual',signal:AbortSignal.timeout(12000)});
 const [page,manifestResponse,associationResponse]=await Promise.all([get(url),get(manifestURL),get(associationURL)]);
 const manifest=manifestResponse.ok?await manifestResponse.json().catch(()=>null):null;
 const webReady=page.ok&&manifest!==null&&validateManifest(manifest,manifestURL,url);
 let associationStatus;
 if(!associationResponse.ok)associationStatus='HTTP '+associationResponse.status;
 else if(!/^application\/json(?:[\s;]|$)/i.test(associationResponse.headers.get('Content-Type')??'')){
  associationStatus='Invalid content type';
 }else{
  const statements=await associationResponse.json().catch(()=>null);
  if(!Array.isArray(statements))associationStatus='Invalid statement list';
  else if(!packageName)associationStatus='Package name and Play signing fingerprint needed';
  else if(!matchingAssociation(statements,packageName,fingerprint))associationStatus='No matching Play signing association';
  else associationStatus='Verified';
 }
 return {site:url.href,manifest:manifestURL.href,webReady,association:associationURL.href,associationStatus,
  ready:webReady&&associationStatus==='Verified'};
}

async function main(){
 const {positionals,values}=parseArgs({allowPositionals:true,options:{
  package:{type:'string'},fingerprint:{type:'string'}
 }});
 if(positionals.length!==1){
  throw Error('Usage: node scripts/android-preflight.mjs HTTPS_APP_URL [--package PACKAGE --fingerprint SHA256]');
 }
 const report=await assessAndroidRelease(releaseInputs(positionals[0],values.package,values.fingerprint));
 console.log(JSON.stringify(report,null,2));
 if(!report.ready)process.exitCode=1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
