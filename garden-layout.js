// Reserve the mature plant footprint, including its leaves, before planting.
export const plantingAllowed=phase=>['plant','blooming','sky','collapse','orbit','night','search','mend','restored'].includes(phase);
export function clearRoseSpot(candidate,roses,gap=.12){
  return roses.every(r=>Math.hypot(candidate.x-r.x,candidate.z-r.z)>=candidate.radius+r.radius+gap);
}
export function findRoseSpot(center,radius,bounds,roses,visible=()=>true,rings=9){
  for(let ring=0;ring<=rings;ring++){
    const count=ring?ring*8:1;
    for(let i=0;i<count;i++){
      const angle=i/count*Math.PI*2+ring*.37,distance=ring*Math.max(radius,.2)*.72;
      const p={x:center.x+Math.cos(angle)*distance,z:center.z+Math.sin(angle)*distance,radius};
      if(p.x-radius<bounds.left||p.x+radius>bounds.right||p.z-radius<bounds.back||p.z+radius>bounds.front)continue;
      if(clearRoseSpot(p,roses)&&visible(p))return p;
    }
  }
  return null;
}
