// Raw sign classification, not a legal parking decision.
export function category(text='') {
 const s=text.toUpperCase();
 if(/COMMERCIAL|TRUCK|LOADING ONLY/.test(s)) return 'commercial';
 if(/NO (PARKING|STANDING|STOPPING)/.test(s)) return 'restriction';
 if(/METER|MUNI.METER/.test(s)) return 'meter';
 return 'unknown';
}
export function distance(a,b){const r=Math.PI/180;const dlat=(b[0]-a[0])*r,dlon=(b[1]-a[1])*r;const h=Math.sin(dlat/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dlon/2)**2;return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));}
