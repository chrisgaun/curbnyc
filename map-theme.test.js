import assert from 'node:assert/strict';
import test from 'node:test';
import {applyMapTheme,applyMeterPatterns,applyPageTheme,mapPaint,meterPatternLayers,resolveTheme} from './map-theme.js';

function brightness(hex){
 const channels=hex.slice(1).match(/../g).map(channel=>{
  const srgb=Number.parseInt(channel,16)/255;
  return srgb<=0.04045?srgb/12.92:((srgb+0.055)/1.055)**2.4;
 });
 return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
}

function contrast(a,b){
 const [dark,light]=[brightness(a),brightness(b)].sort((a,b)=>a-b);
 return (light+0.05)/(dark+0.05);
}

test('System follows the device and manual appearance takes priority',()=>{
 assert.equal(resolveTheme('system',true),'dark');
 assert.equal(resolveTheme('system',false),'light');
 assert.equal(resolveTheme('dark',false),'dark');
 assert.equal(resolveTheme('light',true),'light');
});

test('status colors match the UI and stay legible in both palettes',()=>{
 for(const theme of ['light','dark']){
  const css=new Map(),root={dataset:{},style:{setProperty:(k,v)=>css.set(k,v)}};
  applyPageTheme(root,theme);
  assert.equal(root.dataset.theme,theme);
  const paint=mapPaint(theme),curbs=paint.meters['line-color'];
  assert.deepEqual(curbs,['match',['get','state'],
   'paid',css.get('--curb-paid'),'inactive',css.get('--curb-inactive'),
   'restricted',css.get('--curb-restricted'),css.get('--curb-unknown')]);
  for(const color of css.values()){
   assert.ok(contrast(color,theme==='dark'?'#1c2733':'#ffffff')>=4.5);
   assert.ok(contrast(color,paint.roads['line-color'])>=3);
  }
  assert.ok(contrast(paint['street-names']['text-color'],paint.roads['line-color'])>=4.5);
 }
});

test('switching map appearance updates paint only',()=>{
 const layers=new Set();
 const map={setPaintProperty(layer){layers.add(layer);}};
 applyMapTheme(map,'dark');
 assert.deepEqual(layers,new Set(['background','parks','buildings','road-outline','roads','street-names','meters','focus']));
});

test('line patterns are distinct and follow the theme without modifying data',()=>{
 const calls=[];
 const map={setPaintProperty(...args){calls.push(args);},setLayoutProperty(...args){calls.push(args);}};
 const dark=meterPatternLayers('dark',true),light=meterPatternLayers('light',false);
 assert.equal(new Set(dark.map(layer=>JSON.stringify(layer.paint['line-dasharray']))).size,4);
 assert.ok(light.every(layer=>layer.layout.visibility==='none'));
 assert.notEqual(dark[0].paint['line-color'],light[0].paint['line-color']);
 applyMeterPatterns(map,'dark',true);
 assert.deepEqual(calls[0],['meters','line-opacity',0]);
 assert.equal(calls.length,9);
});
