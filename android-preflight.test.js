import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {assessAndroidRelease,matchingAssociation,releaseInputs,validateManifest} from './scripts/android-preflight.mjs';

const site='https://example.org/curbnyc/';
const name='example.parking';
const fingerprint=Array.from({length:32},()=> 'AB').join(':');
const manifest=JSON.parse(readFileSync(new URL('./manifest.json',import.meta.url),'utf8'));
const link={
 relation:['delegate_permission/common.handle_all_urls'],
 target:{namespace:'android_app',package_name:name,sha256_cert_fingerprints:[fingerprint]}
};

test('release verification rejects insecure input and incomplete Android identity',()=>{
 assert.throws(()=>releaseInputs('http://example.org/curbnyc/'),/HTTPS/);
 assert.throws(()=>releaseInputs(site,name),/together/);
 assert.throws(()=>releaseInputs(site,name,'AA'),/SHA-256/);
 assert.equal(releaseInputs(site,name,fingerprint.toLowerCase()).fingerprint,fingerprint);
});

test('associations require the expected package, certificate and relation',()=>{
 assert.equal(matchingAssociation([link],name,fingerprint),true);
 assert.equal(matchingAssociation([link],'another.parking',fingerprint),false);
 assert.equal(matchingAssociation([link],name,fingerprint.replace('AB','CD')),false);
 assert.equal(matchingAssociation([{...link,relation:['delegate_permission/common.get_login_creds']}],name,fingerprint),false);
});

test('web shell and platform association are reported independently',async()=>{
 const requests=[];
 const input=releaseInputs(site,name,fingerprint);
 const fetcher=association=>async(url,options)=>{
  requests.push([url.href,options.redirect]);
  if(url.pathname.endsWith('manifest.json'))return Response.json(manifest);
  if(url.pathname.endsWith('assetlinks.json'))return association();
  return new Response('Web app');
 };
 const bad=await assessAndroidRelease(input,fetcher(()=>new Response(null,{status:302})));
 assert.equal(bad.webReady,true);
 assert.equal(bad.associationStatus,'HTTP 302');
 assert.equal(bad.ready,false);
 assert.ok(requests.some(([url,policy])=>url==='https://example.org/.well-known/assetlinks.json'&&policy==='manual'));
 const good=await assessAndroidRelease(input,fetcher(()=>Response.json([link])));
 assert.equal(good.ready,true);
 assert.equal(validateManifest({...manifest,scope:'/'},new URL('manifest.json',site),new URL(site)),false);
 assert.equal(validateManifest({...manifest,icons:[{type:'image/png',sizes:192}]},new URL('manifest.json',site),new URL(site)),false);
});
