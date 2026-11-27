import assert from 'node:assert/strict';
import test from 'node:test';
import {searchResults,searchURL} from './destination-search.js';
import {readMapPreferences,saveMapPreferences} from './map-preferences.js';

test('search sends only submitted text and a result limit to NYC Planning',()=>{
 const url=searchURL('  476 Fifth Avenue & 42 Street  ');
 assert.equal(url.origin,'https://geosearch.planninglabs.nyc');
 assert.deepEqual([...url.searchParams.entries()],[['text','476 Fifth Avenue & 42 Street'],['size','5']]);
});

test('results distinguish boroughs and reject invalid or duplicate geometry',()=>{
 const point=(borough,coordinates)=>({geometry:{type:'Point',coordinates},properties:{name:'476 Fifth Avenue',borough}});
 const manhattan=point('Manhattan',[-73.98225,40.753202]);
 const brooklyn=point('Brooklyn',[-73.98743,40.668271]);
 assert.deepEqual(searchResults({type:'FeatureCollection',features:[
  manhattan,manhattan,brooklyn,point('Newark',[-74.17,40.72]),point('Queens',[0,0]),
  point('Queens',['-73.82',40.75])
 ]}),[
  {label:'476 Fifth Avenue',borough:'Manhattan',center:manhattan.geometry.coordinates},
  {label:'476 Fifth Avenue',borough:'Brooklyn',center:brooklyn.geometry.coordinates}
 ]);
 assert.throws(()=>searchResults({features:null}),/Invalid search response/);
});

test('only map display options survive reload and invalid settings fall back',()=>{
 let data;
 const storage={getItem:()=>data,setItem:(_key,value)=>{data=value;}};
 assert.deepEqual(readMapPreferences(storage),{radius:'500',hideRestricted:true});
 saveMapPreferences({radius:'800',hideRestricted:false,arrival:'2026-11-26T10:00',destination:'Example'},storage);
 assert.deepEqual(JSON.parse(data),{radius:'800',hideRestricted:false});
 assert.deepEqual(readMapPreferences(storage),{radius:'800',hideRestricted:false});
 data='{"radius":"invalid","hideRestricted":"false"}';
 assert.deepEqual(readMapPreferences(storage),{radius:'500',hideRestricted:true});
 const blocked={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
 assert.doesNotThrow(()=>saveMapPreferences({radius:'250',hideRestricted:true},blocked));
 assert.deepEqual(readMapPreferences(blocked),{radius:'500',hideRestricted:true});
});
