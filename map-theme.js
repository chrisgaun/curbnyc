const palettes={
 light:{
  status:{paid:'#1d56cf',inactive:'#187340',restricted:'#a92d36',unknown:'#535d68'},
  background:'#eeeee8',parks:'#c8dbc0',buildings:'#d6d7d2',buildingEdge:'#c7c9c3',
  roadEdge:'#d1d3cd',roads:'#ffffff',streetText:'#505a5d',focus:'#2265bf'
 },
 dark:{
  status:{paid:'#83baff',inactive:'#76e0a5',restricted:'#ff9099',unknown:'#cad1db'},
  background:'#171f29',parks:'#223a34',buildings:'#273442',buildingEdge:'#354554',
  roadEdge:'#232e39',roads:'#364352',streetText:'#e0e8f2',focus:'#80bcff'
 }
};

export function resolveTheme(choice,systemDark){
 return choice==='light'||choice==='dark'?choice:systemDark?'dark':'light';
}

export function mapPaint(theme){
 const {status,background,parks,buildings,buildingEdge,roadEdge,roads,streetText,focus}=palettes[theme];
 return {
  background:{'background-color':background},
  parks:{'fill-color':parks},
  buildings:{'fill-color':buildings,'fill-outline-color':buildingEdge},
  'road-outline':{'line-color':roadEdge},
  roads:{'line-color':roads},
  'street-names':{'text-color':streetText,'text-halo-color':roads},
  meters:{'line-color':['match',['get','state'],
   'paid',status.paid,'inactive',status.inactive,'restricted',status.restricted,status.unknown]},
  focus:{'circle-color':focus,'circle-stroke-color':roads}
 };
}

export function applyMapTheme(map,theme){
 for(const [layer,paint] of Object.entries(mapPaint(theme))){
  for(const [property,value] of Object.entries(paint))map.setPaintProperty(layer,property,value);
 }
}

export function applyPageTheme(root,theme){
 root.dataset.theme=theme;
 for(const [state,color] of Object.entries(palettes[theme].status))root.style.setProperty('--curb-'+state,color);
}
