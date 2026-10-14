import {clamp,mix,smooth} from './story-state.js';
export const TILE_SIZE=20;
export function seededRandom(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
export function tileSeed(seed,x,z){return (seed^Math.imul(x,73856093)^Math.imul(z,19349663))>>>0;}
export function extendedBounds(garden){return{left:garden.left-88,right:garden.right+88,back:garden.back-112,front:garden.front+72};}
export function insideGarden(x,z,b){return x>=b.left&&x<=b.right&&z>=b.back&&z<=b.front;}
export function extendedHeight(x,z,garden,baseHeight,seed){
  const bx=clamp(x,garden.left,garden.right),bz=clamp(z,garden.back,garden.front),distance=Math.hypot(x-bx,z-bz);
  if(distance===0)return baseHeight(x,z);
  // Continue the drawn land's edge without a height jump, then grow broad rolling hills.
  const border=baseHeight(bx,bz),phase=(seed%997)*.013;
  const hills=-.4+Math.sin(x*.047+phase)*Math.cos(z*.038-phase)*2.4+Math.sin(x*.101+z*.073+phase)*.55;
  return mix(border,hills,smooth(0,32,distance));
}
export function shardSites(bounds,origin,seed){
  const rand=seededRandom(seed),out=[],cols=4,rows=2;
  const marginX=Math.min(8,(bounds.right-bounds.left)*.08),marginZ=Math.min(8,(bounds.front-bounds.back)*.08);
  for(let id=0;id<8;id++){
    let site;
    for(let attempt=0;attempt<40;attempt++){
      const u=(id%cols+.2+rand()*.6)/cols,v=(Math.floor(id/cols)+.18+rand()*.64)/rows;
      site={id,x:mix(bounds.left+marginX,bounds.right-marginX,u),z:mix(bounds.back+marginZ,bounds.front-marginZ,v)};
      if(Math.hypot(site.x-origin.x,site.z-origin.z)>24&&out.every(s=>Math.hypot(s.x-site.x,s.z-site.z)>20))break;
    }
    out.push(site);
  }
  return out;
}
export function visibleTiles(position,radius=2){const x=Math.floor(position.x/TILE_SIZE),z=Math.floor(position.z/TILE_SIZE),out=[];for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++)out.push({x:x+dx,z:z+dz,key:`${x+dx},${z+dz}`});return out;}
