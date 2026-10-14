export const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
export const mix=(a,b,t)=>a+(b-a)*t;
export const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export const SUNSET_SECONDS=6;
export const MOON_SHARDS=8;
export const COMET_TAPS=7;
export const moonRise=(phase,age)=>phase==='night'?smooth(0,2,age):phase==='restored'?1:0;
export const skyBlackout=(phase,age,reduced=false)=>phase==='shatter'?smooth(.45,4.3/(reduced?5:1),age):['darkness','awakening','search','mend'].includes(phase)?1:phase==='restore'?1-smooth(0,4.5/(reduced?5:1),age):0;
export const moonChapter=phase=>['shatter','darkness','awakening','search','mend','restore'].includes(phase);
export function sampleLine(points,x){
  if(!points.length)return .57;
  if(x<=points[0].x)return points[0].y;
  for(let i=1;i<points.length;i++)if(x<=points[i].x){const a=points[i-1],b=points[i];return mix(a.y,b.y,clamp((x-a.x)/(b.x-a.x||1)));}
  return points.at(-1).y;
}
export class StoryFlow{
  constructor(reduced=false){this.reduced=reduced;this.reset();}
  reset(){this.phase='draw';this.age=0;this.patches=0;this.angle=Math.PI/2;this.orbitAge=0;this.selected={x:.5,y:.23};this.comets=0;this.paused=false;this.found=new Set();this.mended=new Set();}
  enter(phase){this.phase=phase;this.age=0;}
  finishLine(points){if(this.phase!=='draw'||points.length<2||points[0].x>.11||points.at(-1).x<.94)return false;this.enter('land');return true;}
  plantPatch(){if(this.phase!=='plant')return false;this.patches++;if(this.patches>=8)this.enter('blooming');return true;}
  chooseSky(x,y){if(this.phase!=='sky')return false;this.orbitAge=0;this.selected={x:clamp(x),y:clamp(y,.07,.72)};this.enter('collapse');return true;}
  wish(){if(!['night','restored'].includes(this.phase))return false;this.comets++;if(this.phase==='night'&&this.comets===COMET_TAPS)this.breakMoon();return true;}
  breakMoon(){if(this.phase!=='night'||this.comets<COMET_TAPS)return false;this.enter('shatter');return true;}
  findShard(id){if(this.phase!=='search'||!Number.isInteger(id)||id<0||id>=MOON_SHARDS||this.found.has(id))return false;this.found.add(id);if(this.found.size===MOON_SHARDS)this.enter('mend');return true;}
  placeShard(id){if(this.phase!=='mend'||!this.found.has(id)||this.mended.has(id))return false;this.mended.add(id);if(this.mended.size===MOON_SHARDS)this.enter('restore');return true;}
  tick(dt){
    if(this.paused)return;
    this.age+=dt;
    const speed=this.reduced?5:1;
    if(this.phase==='land'&&this.age>=3.8/speed)this.enter('grass');
    else if(this.phase==='grass'&&this.age>=2.8/speed)this.enter('plant');
    else if(this.phase==='blooming'&&this.age>=1.8/speed)this.enter('sky');
    else if(this.phase==='collapse'&&this.age>=3.8/speed){this.orbitAge=0;this.enter('orbit');}
    else if(this.phase==='orbit'){this.orbitAge=Math.min(SUNSET_SECONDS,this.orbitAge+dt);if(this.orbitAge>=SUNSET_SECONDS-1e-9)this.enter('night');}
    else if(this.phase==='shatter'&&this.age>=4.6/speed)this.enter('darkness');
    else if(this.phase==='darkness'&&this.age>=1.1)this.enter('awakening');
    else if(this.phase==='awakening'&&this.age>=3/speed)this.enter('search');
    else if(this.phase==='restore'&&this.age>=4.5/speed)this.enter('restored');
  }
}
