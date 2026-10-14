import {clamp,mix,MOON_SHARDS} from './story-state.js';
import {shardSites} from './meadow-world.js';
export class QuestState{
  constructor(bounds,origin,seed=371){
    this.bounds={...bounds};this.position={x:clamp(origin.x,bounds.left,bounds.right),z:clamp(origin.z,bounds.back,bounds.front)};
    this.velocity={x:0,z:0};this.guiding=null;this.found=new Set();this.distance=0;
    this.shards=shardSites(bounds,origin,seed).slice(0,MOON_SHARDS);
  }
  nearest(){return this.shards.filter(s=>!this.found.has(s.id)).sort((a,b)=>this.range(a)-this.range(b))[0]??null;}
  range(s){return Math.hypot(s.x-this.position.x,s.z-this.position.z);}
  guide(){this.guiding=this.nearest()?.id??null;return this.guiding;}
  windDirection(){const s=this.nearest();if(!s)return{x:0,z:0};const d=Math.max(this.range(s),.001);return{x:(s.x-this.position.x)/d,z:(s.z-this.position.z)/d};}
  stop(){this.velocity={x:0,z:0};this.guiding=null;}
  step(dt,input={x:0,z:0,boost:false}){
    let x=input.x||0,z=input.z||0;
    if(Math.hypot(x,z)>.08)this.guiding=null;
    if(this.guiding!==null){const s=this.shards[this.guiding],d=this.range(s);x=(s.x-this.position.x)/Math.max(d,.001);z=(s.z-this.position.z)/Math.max(d,.001);}
    const magnitude=Math.hypot(x,z);if(magnitude>1){x/=magnitude;z/=magnitude;}
    const speed=input.boost?14:8,blend=1-Math.exp(-6*dt);
    this.velocity.x=mix(this.velocity.x,x*speed,blend);this.velocity.z=mix(this.velocity.z,z*speed,blend);
    const previous={...this.position};
    this.position.x=clamp(this.position.x+this.velocity.x*dt,this.bounds.left,this.bounds.right);
    this.position.z=clamp(this.position.z+this.velocity.z*dt,this.bounds.back,this.bounds.front);
    this.distance+=Math.hypot(previous.x-this.position.x,previous.z-this.position.z);
    const picked=[];
    for(const s of this.shards){if(this.found.has(s.id))continue;
      // Sweep the movement segment so a fast glide cannot skip a shard.
      const dx=this.position.x-previous.x,dz=this.position.z-previous.z;
      const t=clamp(((s.x-previous.x)*dx+(s.z-previous.z)*dz)/(dx*dx+dz*dz||1));
      if(Math.hypot(s.x-previous.x-t*dx,s.z-previous.z-t*dz)<1.25){this.found.add(s.id);picked.push(s.id);if(this.guiding===s.id)this.guiding=null;}
    }
    return picked;
  }
}
