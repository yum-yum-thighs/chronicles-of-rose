import * as THREE from './vendor/three.module.min.js';
import {clamp,mix,smooth,MOON_SHARDS} from './story-state.js';
import {QuestState} from './quest-state.js';
const $=id=>document.getElementById(id);
const sectorPath=id=>{const a=id*Math.PI/4-Math.PI/2,b=a+Math.PI/4,r=44;return`M50 50 L${50+Math.cos(a)*r} ${50+Math.sin(a)*r} A44 44 0 0 1 ${50+Math.cos(b)*r} ${50+Math.sin(b)*r} Z`;};
function fragmentGeometry(id){const a=id*Math.PI/4-Math.PI/2,b=a+Math.PI/4,shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(Math.cos(a),Math.sin(a));shape.absarc(0,0,1,a,b,false);shape.closePath();return new THREE.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:true,bevelThickness:.025,bevelSize:.018,bevelSegments:2,steps:1,curveSegments:10});}
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(48,48,0,48,48,48);g.addColorStop(0,'#fffbea');g.addColorStop(.08,'rgba(255,232,169,.95)');g.addColorStop(.30,'rgba(255,192,103,.28)');g.addColorStop(1,'rgba(255,168,84,0)');ctx.fillStyle=g;ctx.fillRect(0,0,96,96);return new THREE.CanvasTexture(c);}
export class MoonQuest{
  constructor({scene,camera,groundHeight,bounds,seed,roses,flow,reduced,onCollect}){
    Object.assign(this,{scene,camera,groundHeight,flow,reduced,onCollect});this.abort=new AbortController();this.keys=new Set();this.steer={x:0,z:0};this.boost=false;this.lastInput=0;this.phase='';this.trail=[];
    this.baseCamera=camera.position.clone();this.baseRotation=camera.quaternion.clone();
    const questBounds={...bounds};
    const originRose=[...roses].sort((a,b)=>Math.hypot(a.x,a.z-6)-Math.hypot(b.x,b.z-6))[0];
    this.origin={x:originRose?.x??0,z:originRose?.z??6};
    questBounds.left=Math.min(questBounds.left,this.origin.x-.5);questBounds.right=Math.max(questBounds.right,this.origin.x+.5);questBounds.back=Math.min(questBounds.back,this.origin.z-.5);questBounds.front=Math.max(questBounds.front,this.origin.z+.5);
    this.originHeight=originRose?originRose.h*originRose.size:1.4;
    this.state=new QuestState(questBounds,this.origin,seed);this.group=new THREE.Group();scene.add(this.group);
    const texture=glowTexture();this.texture=texture;
    this.lantern=new THREE.Group();this.group.add(this.lantern);
    const core=new THREE.Mesh(new THREE.SphereGeometry(.13,16,12),new THREE.MeshBasicMaterial({color:0xfff3cf,toneMapped:false}));this.lantern.add(core);
    this.halo=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));this.halo.scale.set(3.6,3.6,1);this.lantern.add(this.halo);
    this.light=new THREE.PointLight(0xffdfae,0,22,2);this.lantern.add(this.light);this.lantern.visible=false;
    const trailGeo=new THREE.BufferGeometry();trailGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(96*3),3));trailGeo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(96*3),3));trailGeo.setDrawRange(0,0);
    this.trailMesh=new THREE.Points(trailGeo,new THREE.PointsMaterial({size:.23,map:texture,transparent:true,depthWrite:false,vertexColors:true,blending:THREE.AdditiveBlending,toneMapped:false}));this.trailMesh.frustumCulled=false;this.group.add(this.trailMesh);
    const moonRay=new THREE.Raycaster();moonRay.setFromCamera(new THREE.Vector2(.78*2-1,1-.21*2),camera);this.fallOrigin=moonRay.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),14),new THREE.Vector3());
    this.fragments=this.state.shards.map(s=>{
      const root=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:0xbfe6e5,emissive:0x88dce5,emissiveIntensity:.05,roughness:.25,metalness:.15,transparent:true,opacity:1,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(fragmentGeometry(s.id),mat);root.add(mesh);
      const lines=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,35),new THREE.LineBasicMaterial({color:0xcffaff,transparent:true,opacity:.7}));root.add(lines);
      const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,color:0x9df1f4,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));glow.scale.set(2,2,1);root.add(glow);this.group.add(root);
      return{root,mat,lines,glow,pickedAge:0,...s};
    });
    this.buildWind();this.bindControls();this.buildPuzzle();this.updateCount();
  }
  buildWind(){
    this.gustUntil=0;this.lastClock=0;this.windVector=new THREE.Vector2(0,-1);this.windGroup=new THREE.Group();this.group.add(this.windGroup);
    const geometry=new THREE.BufferGeometry(),vertices=42*12*2;geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(vertices*3),3));geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(vertices*3),3));
    this.windRibbons=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.45,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,fog:false}));this.windRibbons.frustumCulled=false;this.windGroup.add(this.windRibbons);
    const petal=new THREE.CircleGeometry(.065,5);petal.scale(.6,1.7,1);this.windPetals=new THREE.InstancedMesh(petal,new THREE.MeshBasicMaterial({color:0xf0dfb8,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false,toneMapped:false,fog:false}),64);this.windPetals.frustumCulled=false;this.windGroup.add(this.windPetals);this.windDummy=new THREE.Object3D();
  }
  windStrength(clock){return this.reduced?.65:(clock<this.gustUntil?1:.38+.27*(.5+.5*Math.sin(clock*.8)));}
  updateWind(dt,clock){
    this.lastClock=clock;this.windGroup.visible=this.flow.phase==='search';if(!this.windGroup.visible)return;
    const target=this.state.windDirection(),blend=this.reduced?1:1-Math.exp(-2.5*dt);this.windVector.lerp(new THREE.Vector2(target.x,target.z),blend);if(this.windVector.lengthSq()<.01)this.windVector.set(target.x,target.z);this.windVector.normalize();
    const dx=this.windVector.x,dz=this.windVector.y,p=this.state.position,strength=this.windStrength(clock),positions=this.windRibbons.geometry.attributes.position,colors=this.windRibbons.geometry.attributes.color;
    const time=this.reduced?0:clock;
    let index=0;
    for(let ribbon=0;ribbon<42;ribbon++){
      const lateral=Math.sin(ribbon*12.989)*10,offset=((time*(1.1+strength)+ribbon*.71)%5)/5*24-10,height=.4+(ribbon%6)*.34;
      for(let segment=0;segment<12;segment++)for(let tip=0;tip<2;tip++){
        const t=(segment+tip)/12,along=offset+t*(1.6+strength*2.5),curl=Math.sin(t*3.5+ribbon+time)*.16;
        const x=p.x+dx*along-dz*(lateral+curl),z=p.z+dz*along+dx*(lateral+curl),y=this.groundHeight(x,z)+height+Math.sin(t*2+ribbon)*.13;
        positions.setXYZ(index,x,y,z);const fade=Math.sin(t*Math.PI)*Math.max(0,1-Math.abs(offset)/16)*(.25+strength*.55);colors.setXYZ(index,fade*.76,fade*.88,fade);index++;
      }
    }
    positions.needsUpdate=colors.needsUpdate=true;
    for(let i=0;i<64;i++){
      const along=((time*(3+strength*4)+i*1.33)%24)-10,lateral=Math.sin(i*19.7)*9+Math.sin(time+i)*.3;
      const x=p.x+dx*along-dz*lateral,z=p.z+dz*along+dx*lateral;
      this.windDummy.position.set(x,this.groundHeight(x,z)+.7+(i%7)*.29,z);this.windDummy.rotation.set(time*.6+i,time*.8+i,time+i*.2);this.windDummy.scale.setScalar(.5+strength*.8);this.windDummy.updateMatrix();this.windPetals.setMatrixAt(i,this.windDummy.matrix);
    }
    this.windPetals.instanceMatrix.needsUpdate=true;this.windRibbons.material.opacity=this.reduced?.4:.35+strength*.2;
  }
  bindControls(){const options={signal:this.abort.signal};
    const controls=['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','shift'];
    window.addEventListener('keydown',e=>{if(this.flow.phase!=='search')return;const key=e.key.toLowerCase();if(controls.includes(key)){e.preventDefault();this.keys.add(key);this.state.guiding=null;this.steer={x:0,z:0};}if(key==='h')this.hint();},options);
    window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()),options);
    window.addEventListener('blur',()=>this.stop(),options);document.addEventListener('visibilitychange',()=>this.stop(),options);
    document.querySelectorAll('[data-steer]').forEach(b=>{
      b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);this.keys.add(b.dataset.steer);this.state.guiding=null;},options);
      for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>this.keys.delete(b.dataset.steer),options);
    });
  }
  pointer(e,type){if(this.flow.phase!=='search')return false;
    if(type==='down'){this.boost=true;if(e.pointerType==='touch'){this.touch={x:e.clientX,y:e.clientY};this.steer={x:0,z:0};}this.state.guiding=null;}
    if(type==='move'){
      if(e.pointerType==='touch'){if(!this.touch)return true;this.steer={x:clamp((e.clientX-this.touch.x)/70,-1,1),z:clamp((e.clientY-this.touch.y)/70,-1,1)};}
      else this.steer={x:clamp((e.clientX/innerWidth-.5)*2.2,-1,1),z:clamp((e.clientY/innerHeight-.5)*2.2,-1,1)};
      this.lastInput=performance.now();this.state.guiding=null;
    }
    if(type==='up'){this.boost=false;if(e.pointerType==='touch'){this.touch=null;this.steer={x:0,z:0};}}
    if(type==='leave'&&!this.touch){this.steer={x:0,z:0};this.boost=false;}
    return true;
  }
  stop(){this.keys.clear();this.steer={x:0,z:0};this.boost=false;this.touch=null;this.state.stop();}
  hint(){if(this.flow.phase!=='search')return;this.gustUntil=this.lastClock+6;this.hintActive=true;this.updateHint();$('quest-assist').hidden=false;}
  assist(){if(this.flow.phase!=='search')return;this.steer={x:0,z:0};this.keys.clear();this.state.guide();this.hint();}
  updateHint(){const s=this.state.nearest();if(!s)return;const dx=s.x-this.state.position.x,dz=s.z-this.state.position.z,d=this.state.range(s),direction=Math.abs(dx)>Math.abs(dz)?(dx<0?'left':'right'):(dz<0?'ahead':'behind');
    $('quest-bearing').style.transform=`rotate(${Math.atan2(dx,-dz)}rad)`;$('quest-whisper').textContent=d<5?'A shard is close. Follow its shimmer.':`The wind is carrying petals ${direction}.`;
    $('quest-compass').hidden=(!this.hintActive||this.lastClock>this.gustUntil)&&d>6;
  }
  updateCount(){const n=this.state.found.size;$('shard-count').textContent=`${n} / ${MOON_SHARDS}`;$('quest-progress').setAttribute('aria-valuenow',n);$('quest-progress').dataset.found=n;
    $('quest-progress').querySelectorAll('i').forEach((el,i)=>el.classList.toggle('found',i<n));
  }
  buildPuzzle(){const ns='http://www.w3.org/2000/svg',slots=$('moon-slots');slots.replaceChildren();$('fragment-tray').replaceChildren();
    for(let id=0;id<MOON_SHARDS;id++){
      const path=document.createElementNS(ns,'path');path.setAttribute('d',sectorPath(id));path.dataset.shard=id;slots.append(path);
      const button=document.createElement('button');button.className='moon-fragment';button.dataset.shard=id;button.setAttribute('aria-label',`Place moon fragment ${id+1}`);button.innerHTML=`<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${sectorPath(id)}"/></svg><span>${id+1}</span>`;$('fragment-tray').append(button);
      let drag=null,suppressClick=false;
      button.addEventListener('pointerdown',e=>{if(this.flow.phase!=='mend')return;button.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,moved:false};button.classList.add('dragging');},{signal:this.abort.signal});
      button.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved=Math.hypot(dx,dy)>9;button.style.transform=`translate(${dx}px,${dy}px)`;},{signal:this.abort.signal});
      button.addEventListener('pointerup',e=>{if(!drag)return;const box=$('moon-target').getBoundingClientRect(),inside=Math.hypot(e.clientX-box.x-box.width/2,e.clientY-box.y-box.height/2)<box.width*.65;
        suppressClick=drag.moved;if(drag.moved&&inside)this.place(id);drag=null;button.style.transform='';button.classList.remove('dragging');},{signal:this.abort.signal});
      button.addEventListener('pointercancel',()=>{drag=null;button.style.transform='';button.classList.remove('dragging');},{signal:this.abort.signal});
      button.addEventListener('click',()=>{if(suppressClick){suppressClick=false;return;}this.place(id);},{signal:this.abort.signal});
    }
  }
  place(id){if(!this.flow.placeShard(id))return;const slot=$('moon-slots').querySelector(`[data-shard="${id}"]`);slot.classList.add('placed');const button=$('fragment-tray').querySelector(`[data-shard="${id}"]`);button.disabled=true;button.classList.add('placed');$('mend-count').textContent=`${this.flow.mended.size} / ${MOON_SHARDS}`;
    $('action-count').textContent=`${this.flow.mended.size} / ${MOON_SHARDS}`;
  }
  update(dt,clock){const phase=this.flow.phase,p=this.state.position,soil=this.groundHeight(p.x,p.z);
    if(phase!==this.phase){this.phase=phase;if(phase!=='search')this.stop();if(phase==='search')this.gustUntil=clock+8;if(phase==='restore'){this.restoreCamera=this.camera.position.clone();this.restoreRotation=this.camera.quaternion.clone();}}
    if(phase==='search'&&!this.flow.paused){
      const x=(this.keys.has('d')||this.keys.has('arrowright')?1:0)-(this.keys.has('a')||this.keys.has('arrowleft')?1:0),z=(this.keys.has('s')||this.keys.has('arrowdown')?1:0)-(this.keys.has('w')||this.keys.has('arrowup')?1:0),keyboard=x||z;
      const input=keyboard?{x,z,boost:this.keys.has('shift')}:{...this.steer,boost:this.boost};
      const picked=this.state.step(dt,input);for(const id of picked){this.flow.findShard(id);this.onCollect(id,this.state.found.size);}if(picked.length){this.updateCount();this.gustUntil=clock+5;}this.updateHint();
    }
    const awake=phase==='awakening'?smooth(0,3/(this.reduced?5:1),this.flow.age):['search','mend','restore','restored'].includes(phase)?1:0;
    this.lantern.visible=awake>0;const lanternHeight=mix(this.originHeight+.35,2.25,awake)+Math.sin(clock*2.1)*.07;
    this.lantern.position.set(p.x,this.groundHeight(p.x,p.z)+lanternHeight,p.z);
    const restore=phase==='restore'?smooth(0,4.5/(this.reduced?5:1),this.flow.age):phase==='restored'?1:0;
    this.light.intensity=awake*24*(1-restore);this.halo.material.opacity=awake*(1-restore);this.lantern.scale.setScalar(.45+.55*awake);
    if(['awakening','search','mend'].includes(phase)){
      const target=new THREE.Vector3(p.x+.5,soil+6.2,p.z+9),look=new THREE.Vector3(p.x,soil+.9,p.z-3.5);
      if(phase==='awakening'){this.camera.position.copy(this.baseCamera).lerp(target,awake);const rotation=new THREE.Matrix4().lookAt(target,look,new THREE.Vector3(0,1,0));this.camera.quaternion.copy(this.baseRotation).slerp(new THREE.Quaternion().setFromRotationMatrix(rotation),awake);}
      else{if(!this.flow.paused)this.camera.position.lerp(target,1-Math.exp(-3.5*dt));this.camera.lookAt(look);}
      this.camera.updateMatrixWorld();
    }
    if(phase==='restore'){this.camera.position.copy(this.restoreCamera).lerp(this.baseCamera,restore);this.camera.quaternion.copy(this.restoreRotation).slerp(this.baseRotation,restore);this.camera.updateMatrixWorld();}
    if(phase==='restored'){this.camera.position.copy(this.baseCamera);this.camera.quaternion.copy(this.baseRotation);this.group.visible=false;}
    for(const f of this.fragments){
      const ground=this.groundHeight(f.x,f.z),distance=this.state.range(f),found=this.state.found.has(f.id),fall=phase==='shatter'?smooth(.45,3.7/(this.reduced?5:1),this.flow.age):1;
      if(phase==='shatter'){
        f.root.visible=this.flow.age>.4;f.root.position.copy(this.fallOrigin).lerp(new THREE.Vector3(f.x,ground+.45,f.z),fall);f.root.position.y+=Math.sin(fall*Math.PI)*3;
        f.root.rotation.set(fall*2.8,fall*f.id*.6,fall*f.id*.9);f.root.scale.setScalar(mix(1.05,.65,fall));f.mat.opacity=1;f.mat.emissiveIntensity=mix(.8,.15,fall);f.lines.material.opacity=.8;f.glow.material.opacity=.3;
      }else{
        const reveal=awake*(1-smooth(2.7,6.5,distance));f.root.visible=!found&&reveal>.01;
        f.root.position.set(f.x,ground+.50+Math.sin(clock*1.7+f.id)*.06,f.z);f.root.rotation.set(-.18,Math.sin(clock*.3+f.id)*.35,f.id*.7);f.root.scale.setScalar(.65);f.mat.opacity=reveal;f.mat.emissiveIntensity=reveal*(.4+.22*Math.sin(clock*2+f.id));f.lines.material.opacity=reveal;f.glow.material.opacity=reveal*.3;
      }
    }
    if(awake>0&&!this.flow.paused&&!this.reduced){this.trail.unshift(this.lantern.position.clone().add(new THREE.Vector3((Math.sin(clock*17))*.09,Math.cos(clock*13)*.09,0)));if(this.trail.length>96)this.trail.pop();}
    const points=this.trailMesh.geometry.attributes.position,colors=this.trailMesh.geometry.attributes.color;
    for(let i=0;i<this.trail.length;i++){const point=this.trail[i],fade=(1-i/96)**2;points.setXYZ(i,point.x,point.y,point.z);colors.setXYZ(i,fade,fade*.73,fade*.38);}
    points.needsUpdate=colors.needsUpdate=true;this.trailMesh.geometry.setDrawRange(0,this.trail.length);this.trailMesh.visible=awake>0&&restore<1;this.updateWind(this.flow.paused?0:dt,clock);
  }
  finish(){this.camera.position.copy(this.baseCamera);this.camera.quaternion.copy(this.baseRotation);this.camera.updateMatrixWorld();this.group.visible=false;}
  dispose(){this.abort.abort();this.stop();this.finish();this.scene.remove(this.group);const geometry=new Set(),materials=new Set();this.group.traverse(o=>{if(o.geometry)geometry.add(o.geometry);if(o.material)materials.add(o.material);if(o.isInstancedMesh)o.dispose();});geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.texture.dispose();$('fragment-tray').replaceChildren();$('moon-slots').replaceChildren();}
}
