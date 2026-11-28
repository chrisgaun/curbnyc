import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const localRoot=new URL('https://fixture.invalid/app/');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

function assetPath(value,parent){
 const url=new URL(value,new URL(parent,localRoot));
 if(url.origin!==localRoot.origin)return null;
 if(!url.pathname.startsWith(localRoot.pathname))throw Error('Asset is outside the app: '+value);
 const path=url.pathname.slice(localRoot.pathname.length);
 if(!/^[a-z0-9_./-]+$/i.test(path))throw Error('Unsupported asset path: '+value);
 return path;
}

export async function releaseAssets(read){
 const files=new Map();
 async function add(path){
  if(path===null)throw Error('Expected a first-party release asset');
  if(files.has(path))return;
  const bytes=await read(path);
  files.set(path,bytes);
  if(path.endsWith('.js')){
   const imports=bytes.toString().matchAll(/^\s*(?:import|export)\s+[^;]*?\sfrom\s+['"](\.[^'"]+)['"]/gm);
   for(const [,ref] of imports)await add(assetPath(ref,path));
   const sideEffects=bytes.toString().matchAll(/^\s*import\s*['"](\.[^'"]+)['"]/gm);
   for(const [,ref] of sideEffects)await add(assetPath(ref,path));
  }
 }

 await add('index.html');
 const html=files.get('index.html').toString();
 const tags=tag=>[...html.matchAll(new RegExp('<'+tag+'\\b[^>]*>','gi'))].map(([match])=>
  Object.fromEntries([...match.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)]
   .map(([,name,value])=>[name.toLowerCase(),value])));
 const scripts=tags('script'),links=tags('link');
 const active=scripts.find(script=>script.type==='module'&&script.src)?.src;
 const manifest=links.find(link=>link.rel==='manifest')?.href;
 if(!active||!manifest)throw Error('Web entry point must reference the active module and install manifest');
 await add(assetPath(active,'index.html'));
 const manifestPath=assetPath(manifest,'index.html');
 await add(manifestPath);
 const {icons}=JSON.parse(files.get(manifestPath).toString());
 for(const {src} of icons)await add(assetPath(src,manifestPath));
 for(const {href} of links.filter(link=>link.rel==='stylesheet'&&link.href)){
  const path=assetPath(href,'index.html');
  if(path)await add(path);
 }
 await add('sw.js');
 return files;
}

export async function checkRelease(url,files,fetcher=fetch){
 const base=new URL(url);
 const local=['localhost','127.0.0.1','[::1]'].includes(base.hostname);
 if((base.protocol!=='https:'&&!(local&&base.protocol==='http:'))||
    !base.pathname.endsWith('/')||base.search||base.hash||base.username||base.password){
  throw Error('Use an HTTPS app URL ending in / or a local HTTP preview.');
 }
 return Promise.all([...files].map(async ([path,bytes])=>{
  const target=new URL(path==='index.html'?'./':path,base);
  target.searchParams.set('verify',digest(bytes).slice(0,12));
  try{
   const response=await fetcher(target,{redirect:'error',signal:AbortSignal.timeout(12000)});
   if(!response.ok)return {path,problem:'HTTP '+response.status};
   if(digest(Buffer.from(await response.arrayBuffer()))!==digest(bytes))return {path,problem:'Deployed bytes differ'};
   return {path};
  }catch(error){
   return {path,problem:error.message};
  }
 }));
}

async function main(){
 const [url='https://chrisgaun.github.io/curbnyc/',...rest]=process.argv.slice(2);
 if(rest.length)throw Error('Usage: node scripts/check-pages-release.mjs [APP_URL]');
 const source=new URL('../',import.meta.url);
 const files=await releaseAssets(path=>readFile(new URL(path,source)));
 const results=await checkRelease(url,files);
 const failures=results.filter(result=>result.problem);
 for(const {path,problem} of failures)console.error(path+' · '+problem);
 if(failures.length)process.exitCode=1;
 console.log(`${results.length-failures.length}/${results.length} deployed assets match the checkout.`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
