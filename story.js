import * as THREE from './vendor/three.module.min.js';
import {StoryFlow,clamp,mix,smooth,sampleLine,SUNSET_SECONDS,moonChapter,moonRise,skyBlackout,COMET_TAPS} from './story-state.js';
import {plantingAllowed,findRoseSpot} from './garden-layout.js';
import {MoonQuest} from './moon-quest.js';
import {extendedBounds,extendedHeight} from './meadow-world.js';
import {MeadowStream} from './meadow-stream.js';
const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const flow=new StoryFlow(reduced);
let W=innerWidth,H=innerHeight,seed=371,last=performance.now(),clock=0,previousPhase='',keyboardMode=false;
const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
let stroke=[],drawing=false,brushing=false,lastBrush=null,feedbackTimer;
let quest=null,extension=null,worldBounds=null,worldSeed=371;
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:$('world'),alpha:true,antialias:true,powerPreference:'high-performance'});}catch(error){$('fallback').hidden=false;throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(W,H);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0xc4ead3,.013);
const ramp=new THREE.DataTexture(new Uint8Array([112,183,232,255]),4,1,THREE.RedFormat);
ramp.minFilter=ramp.magFilter=THREE.NearestFilter;ramp.needsUpdate=true;
const toon=options=>new THREE.MeshToonMaterial({gradientMap:ramp,...options});
const camera=new THREE.PerspectiveCamera(46,W/H,.1,150);camera.position.set(0,6.7,17);camera.lookAt(0,5.5,-7);camera.updateMatrixWorld();
const hemi=new THREE.HemisphereLight(0xfff8ec,0x69a897,1.65);scene.add(hemi);
const sunLight=new THREE.DirectionalLight(0xffe7c4,1.65);sunLight.position.set(-6,15,9);scene.add(sunLight);
const moonLight=new THREE.DirectionalLight(0xa6c5ec,.2);moonLight.position.set(7,13,-6);scene.add(moonLight);
const meadow=new THREE.Group();scene.add(meadow);meadow.visible=false;
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),edgePlane=new THREE.Plane(new THREE.Vector3(0,0,1),22);
const edge=[],widthBounds={left:-30,right:30};let ground,terrainRest,terrainEdge,grass,grassVisible=0;
const groundMat=toon({color:0x79c67e,side:THREE.DoubleSide});
const grassMat=toon({color:0x9bd998,side:THREE.DoubleSide});
const wind={value:0},grassGrowth={value:0},guideWind={value:new THREE.Vector2()},guideStrength={value:0};
const blade=new THREE.PlaneGeometry(.13,1,1,4);blade.translate(0,.5,0);
// Bending and growth affect only the blade, leaving each root fixed to the soil.
 grassMat.onBeforeCompile=s=>{s.uniforms.wind=wind;s.uniforms.growth=grassGrowth;s.uniforms.guideWind=guideWind;s.uniforms.guideStrength=guideStrength;s.vertexShader='varying float bladeTip; uniform float wind; uniform float growth; uniform vec2 guideWind; uniform float guideStrength;\n'+s.vertexShader;s.fragmentShader='varying float bladeTip;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb=mix(diffuseColor.rgb*.72,diffuseColor.rgb*1.15+vec3(.025,.04,.02),bladeTip);');s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
  bladeTip=position.y;
  vec4 root=instanceMatrix*vec4(0.,0.,0.,1.);
  float born=smoothstep(0.,1.,clamp(growth*1.4-fract(sin(root.x*7.+root.z*3.)*357.1)*.4,0.,1.));
  transformed.x*=1.-position.y*.98;
  transformed.y*=born;
  transformed.x+=sin(wind*.85+root.x*.45+root.z*.4)*.19*position.y*position.y*born;
  transformed.z+=cos(wind*.6+root.x*.3)*.12*position.y*position.y*born;
  float gust=(.65+.35*sin(wind*2.-dot(root.xz,guideWind)*.18))*guideStrength*position.y*position.y*born;
  vec3 worldBend=vec3(guideWind.x,0.,guideWind.y)*gust*.42;
  transformed+=transpose(mat3(instanceMatrix))*worldBend;`);};
const dummy=new THREE.Object3D(),instanceColor=new THREE.Color();
const roses=[],roseTemplates=[];
function toEdge(x,y){ndc.set(x*2-1,1-y*2);ray.setFromCamera(ndc,camera);return ray.ray.intersectPlane(edgePlane,new THREE.Vector3());}
function edgeHeight(x){const t=clamp((x-widthBounds.left)/(widthBounds.right-widthBounds.left))*256,i=Math.min(255,Math.floor(t));return mix(edge[i].y,edge[i+1].y,t-i);}
function baseSoilHeight(x,z){const d=z+22;return mix(edgeHeight(x),-.4,1-Math.exp(-d/12))+(Math.sin(x*.43+z*.23)*.13+Math.cos(x*.17-z*.37)*.09)*smooth(0,7,d);}
function soilHeight(x,z){return worldBounds?extendedHeight(x,z,worldBounds,baseSoilHeight,worldSeed):baseSoilHeight(x,z);}
function createLandscape(){
  edge.length=0;
  for(let i=0;i<=256;i++){const x=mix(-.035,1.035,i/256);edge.push(toEdge(x,sampleLine(stroke,x)));}
  widthBounds.left=edge[0].x;widthBounds.right=edge[256].x;
  const pos=[],idx=[],edgeY=[];
  for(let j=0;j<=48;j++)for(let i=0;i<=256;i++){const e=edge[i],z=mix(-22,13,j/48);pos.push(e.x,soilHeight(e.x,z),z);edgeY.push(e.y);}
  for(let j=0;j<48;j++)for(let i=0;i<256;i++){const a=j*257+i;idx.push(a,a+257,a+1,a+1,a+257,a+258);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
  terrainRest=new Float32Array(pos);terrainEdge=new Float32Array(edgeY);
  if(ground){meadow.remove(ground);ground.geometry.dispose();}ground=new THREE.Mesh(geo,groundMat);meadow.add(ground);
  if(grass){meadow.remove(grass);grass.dispose();}
  const count=W<600?27000:49000;grass=new THREE.InstancedMesh(blade,grassMat,count);
  seed=613;
  for(let i=0;i<count;i++){const x=mix(widthBounds.left,widthBounds.right,random()),z=mix(-21.8,12.8,random());dummy.position.set(x,soilHeight(x,z),z);dummy.rotation.set(0,random()*6.28,(random()-.5)*.1);dummy.scale.set(.8+random()*.55,.32+random()*.68,1);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);instanceColor.setHSL(.25+random()*.08,.46+random()*.20,.33+random()*.17);grass.setColorAt(i,instanceColor);}
  grass.instanceMatrix.needsUpdate=true;grass.visible=false;meadow.add(grass);
  // Reflow mature footprints and flower silhouettes when the viewport changes.
  let layout=[],scale=1;
  while(roses.length){
    layout=[];
    for(const r of roses){
      const center={x:mix(widthBounds.left,widthBounds.right,r.u),z:mix(-22,13,r.v)},size=r.baseSize*scale;
      const spot=findRoseSpot(center,.83*size,gardenBounds(),layout,p=>clearSilhouette(p,size,r.h,layout),18);
      if(!spot)break;
      layout.push({...spot,size,h:r.h,view:silhouette(spot,size,r.h)});
    }
    if(layout.length===roses.length)break;
    scale*=.85;
  }
  layout.forEach((p,i)=>{const r=roses[i];r.x=p.x;r.z=p.z;r.size=p.size;r.radius=.83*p.size;r.view=null;r.root.position.set(r.x,soilHeight(r.x,r.z),r.z);r.u=(r.x-widthBounds.left)/(widthBounds.right-widthBounds.left);r.v=(r.z+22)/35;});
  meadow.visible=true;
}
function unfoldLand(amount){if(!ground)return;const a=ground.geometry.attributes.position;for(let i=0;i<a.count;i++){a.setY(i,mix(terrainEdge[i],terrainRest[i*3+1],amount));a.setZ(i,mix(-22,terrainRest[i*3+2],amount));}a.needsUpdate=true;ground.geometry.computeVertexNormals();ground.geometry.computeBoundingSphere();}

// Rounded, curled petals are merged by layer and shared between all roses.
function petalGeometry(layer){
  const g=new THREE.SphereGeometry(1,20,14),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i),x=p.getX(i),z=p.getZ(i);p.setXYZ(i,x*(.12+layer*.029)*(.77+y*.23),y*(.20+layer*.018),z*.034+Math.pow(x,2)*.06);}
  g.rotateX(.14+layer*.20);g.translate(0,.24-layer*.026,.055+layer*.077);g.computeVertexNormals();return g;
}
function merge(geometries){const p=[],n=[],ix=[];let offset=0;for(const g of geometries){p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);for(const i of g.index.array)ix.push(i+offset);offset+=g.attributes.position.count;}const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(p,3));out.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));out.setIndex(ix);return out;}
const petalMaterials=[0xa72f68,0xe35591,0xff8caf,0xffbcc8].map(c=>toon({color:c,side:THREE.DoubleSide}));
for(let layer=0;layer<4;layer++){const template=petalGeometry(layer),pieces=[],count=4+layer*3;for(let i=0;i<count;i++){const g=template.clone();const m=new THREE.Matrix4().makeRotationY(i/count*Math.PI*2+layer*1.32);g.applyMatrix4(m);g.translate(0,i*.006,0);pieces.push(g);}roseTemplates.push(merge(pieces));template.dispose();pieces.forEach(g=>g.dispose());}
const stemMat=toon({color:0x319b70}),leafMat=toon({color:0x52c58d,side:THREE.DoubleSide});
const stemGeo=new THREE.CylinderGeometry(.023,.035,1,7),heartGeo=new THREE.SphereGeometry(.07,10,8);
const leafShape=new THREE.Shape();leafShape.moveTo(0,0);leafShape.quadraticCurveTo(.3,.19,0,.65);leafShape.quadraticCurveTo(-.24,.2,0,0);const leafGeo=new THREE.ShapeGeometry(leafShape,10);leafGeo.rotateX(-Math.PI*.36);
function makeRose(x,z,size,h,delay=0){const root=new THREE.Group();root.position.set(x,soilHeight(x,z),z);root.rotation.y=random()*6.28;
  const stem=new THREE.Mesh(stemGeo,stemMat);stem.scale.y=h;stem.position.y=h/2;root.add(stem);
  for(let j=0;j<3;j++){const leaf=new THREE.Mesh(leafGeo,leafMat);leaf.position.y=h*(.25+j*.17);leaf.rotation.y=j*2.4;root.add(leaf);}
  const blossom=new THREE.Group();blossom.position.y=h;for(let j=0;j<4;j++)blossom.add(new THREE.Mesh(roseTemplates[j],petalMaterials[j]));const heart=new THREE.Mesh(heartGeo,petalMaterials[0]);heart.position.y=.4;blossom.add(heart);root.add(blossom);meadow.add(root);
  root.scale.setScalar(.001);roses.push({root,blossom,age:-delay,size,baseSize:size,h,x,z,radius:.83*size,u:(x-widthBounds.left)/(widthBounds.right-widthBounds.left),v:(z+22)/35,phase:random()*6.28});
}
function groundPoint(x,y){ndc.set(x*2-1,1-y*2);ray.setFromCamera(ndc,camera);return ground?ray.intersectObjects([ground,...(extension?.surfaces()??[])])[0]?.point:null;}
function gardenBounds(){return quest&&['search','mend'].includes(flow.phase)?quest.state.bounds:{left:widthBounds.left+.15,right:widthBounds.right-.15,back:-21.7,front:12.4};}
function silhouette(p,size,h){
  const head=new THREE.Vector3(p.x,soilHeight(p.x,p.z)+(h+.2)*size,p.z).project(camera);
  const side=new THREE.Vector3(p.x+.55*size,soilHeight(p.x,p.z)+(h+.2)*size,p.z).project(camera);
  return{x:head.x*W/2,y:head.y*H/2,radius:Math.abs(side.x-head.x)*W/2+Math.min(4,size*4)};
}
function clearSilhouette(p,size,h,existing){const a=silhouette(p,size,h);return existing.every(r=>{const b=r.view||silhouette(r,r.size,r.h);return Math.hypot(a.x-b.x,a.y-b.y)>a.radius+b.radius;});}
function plant(x,y){if(!plantingAllowed(flow.phase))return false;const p=groundPoint(x,y);if(!p||(!moonChapter(flow.phase)&&(p.z< -21.8||p.z>12.5)))return false;if(roses.length>=196){tell('Your meadow is full of life.');return false;}
  let planted=0;roses.forEach(r=>{r.view=silhouette(r,r.size,r.h);});
  for(let i=0;i<7&&roses.length<196;i++){
    const size=.72+random()*.38,h=.95+random()*.65;
    const spot=findRoseSpot(p,.83*size,gardenBounds(),roses,c=>clearSilhouette(c,size,h,roses));
    if(spot){makeRose(spot.x,spot.z,size,h,planted*.10);const r=roses.at(-1);r.view=silhouette(r,size,h);planted++;}
  }
  if(!planted){tell('Give your roses a little space. Try another part of the meadow.');return false;}
  flow.plantPatch();$('action-count').textContent=flow.phase==='plant'?`${flow.patches} / 8`:'';return true;
}

const descriptions={
 draw:[0,'THE FIRST LINE','Every world starts<br>with a line.','Make yours a little imperfect.','∿','Hold the glowing dot. Draw a line all the way to the right.','Use your mouse or finger. Gentle hills are welcome.'],
 land:[1,'THE SHAPE OF THINGS','Your line.<br>A little world.','Every curve you drew becomes a piece of the horizon.','≈','Watch your line unfold into land.','The hills are yours.'],
 grass:[1,'THE AWAKENING','Give it room<br>to grow.','Life finds its way into the smallest places.','❧','A little patience. The grass is waking up.','Your meadow is almost ready.'],
 plant:[2,'THE GARDEN','Leave a little<br>beauty behind.','A garden is a collection of small beginnings.','✻','Click the grass to plant rose patches.','Plant 8 patches. You can also hold and brush across the meadow.'],
 blooming:[2,'THE BLOSSOM','Look what<br>you started.','A little care, and the whole world changes.','✻','Let those last petals unfold.','Keep planting. A sky is waiting for you.'],
 sky:[3,'THE LIGHT','Where would you<br>put the sun?','Give your world a little golden light.','☼','Point to the white sky, then click to place the sun.','Place it anywhere. You can keep planting roses, too.'],
 collapse:[3,'THE LIGHT','A little light.<br>A whole new world.','All that empty space was holding a sun.','☼','The white sky is gathering into your sun.','Keep planting while your sky comes to life.'],
 orbit:[3,'THE PASSING HOURS','Let the light<br>find its way.','The sun keeps moving. The moon is on its way.','◌','Watch the sun travel toward evening.','Six seconds of changing light. Keep adding roses below.'],
 night:[4,'THE WISH','Even the dark<br>can blossom.','The meadow is resting. The sky is yours.','✧','Tap the night sky seven times to shower it with comets.','Let seven wishes carry the story forward.'],
 shatter:[5,'THE FRACTURE','Even the moon<br>can break.','Its light falls into the places you brought to life.','◇','The moon is breaking into pieces.','Watch where its fragments fall.'],
 darkness:[5,'THE SILENCE','For a moment,<br>nothing.','The world holds its breath.','·','The meadow has lost its moonlight.','Wait for the smallest beginning.'],
 awakening:[5,'THE LITTLE LIGHT','A rose remembers<br>how to shine.','One small light. Enough to begin again.','✧','A light is rising from one of your roses.','Follow it into the meadow.'],
 search:[5,'THE LITTLE LIGHT','Carry a little light.','You do not have to see the whole way.','✧','Follow the wind through the meadow. Find 8 moon shards.','Point to steer, hold to glide faster. Touch: drag. WASD / arrows. H: call the wind.'],
 mend:[6,'THE RETURN','Bring the light<br>together.','Every piece still belongs.','◐','Return the fragments to the moon.','Drag them into the circle, or tap each piece.'],
 restore:[6,'THE RETURN','Some light is<br>worth finding.','Because of you, the night can blossom again.','☾','Your moon is finding its way home.','Watch the meadow wake beneath its light.'],
 restored:[6,'THE RETURN','Some light is<br>worth finding.','You gathered what was scattered. You gave the dark its light.','☾','The moon is whole. Your garden is yours again.','Keep planting roses, or send another wish into the sky.']
};
function syncUI(){if(previousPhase===flow.phase)return;previousPhase=flow.phase;const c=descriptions[flow.phase];document.body.dataset.phase=flow.phase;$('chapter-number').textContent=String(c[0]+1).padStart(2,'0');$('chapter-label').textContent=c[1];$('story-title').innerHTML=c[2];$('story-description').textContent=c[3];$('instruction-icon').textContent=c[4];$('instruction-text').textContent=c[5];$('instruction-detail').textContent=c[6];$('action-count').textContent=flow.phase==='plant'?`${flow.patches} / 8`:'';
  document.querySelectorAll('.chapters li').forEach((li,i)=>{li.classList.toggle('active',i===c[0]);li.classList.toggle('done',i<c[0]);if(i===c[0])li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
  $('keyboard').hidden=flow.phase!=='draw';$('accessible-action').hidden=!plantingAllowed(flow.phase);$('accessible-action').innerHTML='PLANT ROSES <span>+</span>';$('wish-action').hidden=flow.phase!=='night';
  $('pause').hidden=!['land','grass','blooming','collapse','orbit','night'].includes(flow.phase);$('keyboard-sky').hidden=flow.phase!=='sky'||!keyboardMode;
  const chapter=moonChapter(flow.phase);document.body.classList.toggle('moon-chapter',chapter);document.body.classList.toggle('flying',['awakening','search','mend'].includes(flow.phase));
  $('pause').hidden=!['land','grass','blooming','collapse','orbit','night','shatter','darkness','awakening','search','mend','restore'].includes(flow.phase);
  $('wish-action').hidden=!['night','restored'].includes(flow.phase);
  $('quest-hud').hidden=!['awakening','search'].includes(flow.phase);$('quest-help').hidden=flow.phase!=='search';$('flight-controls').hidden=flow.phase!=='search';
  $('moon-puzzle').hidden=!['mend','restore'].includes(flow.phase);if(flow.phase!=='search')$('quest-compass').hidden=true;
  if(flow.phase==='mend'){$('action-count').textContent='0 / 8';$('mend-count').textContent='0 / 8';}
  if(flow.phase==='restored'&&quest)quest.finish();
  $('sky-cursor').style.opacity=0;
  if(flow.phase==='draw'){
    $('world').setAttribute('aria-label','Interactive garden. Draw a horizon from left to right. Use the keyboard option for arrow-key drawing.');
    clearTimeout(feedbackTimer);$('feedback').textContent='';$('feedback').classList.remove('visible');
  }
  if(flow.phase==='plant')$('world').setAttribute('aria-label','Click or drag on the grass to plant rose patches. Eight patches will fill the garden.');
  if(flow.phase==='sky')$('world').setAttribute('aria-label','Click the sky to choose the sun position. Choose any position. Roses can still be planted in the meadow.');
  if(flow.phase==='night')$('world').setAttribute('aria-label','Click the night sky to make a shower of comets.');
  if(flow.phase==='search')$('world').setAttribute('aria-label','Guide the rose light through the dark meadow. Move the mouse or drag to steer. Hold to glide faster. WASD and arrow keys also move. Nearby moon shards are collected automatically.');
  if(flow.phase==='restored')$('world').setAttribute('aria-label','The moon is restored. Click the sky for comets, or the meadow to plant roses.');
}
function tell(message){$('feedback').textContent=message;$('feedback').classList.add('visible');clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>$('feedback').classList.remove('visible'),2400);}
function renderStroke(){const d=stroke.map((p,i)=>`${i?'L':'M'}${(p.x*W).toFixed(2)},${(p.y*H).toFixed(2)}`).join(' ');$('drawn-line').setAttribute('d',d);if(stroke.length){const p=stroke.at(-1);$('drawing-tip').setAttribute('cx',p.x*W);$('drawing-tip').setAttribute('cy',p.y*H);$('drawing-tip').style.opacity=1;}}
function addPoint(x,y){const p={x:clamp(x,.02,.98),y:clamp(y,.45,.70)};const previous=stroke.at(-1);if(previous&&p.x<=previous.x)return;stroke.push(p);renderStroke();if(p.x>=.94&&flow.finishLine(stroke)){drawing=false;brushing=false;createLandscape();syncUI();}}
function startStroke(x,y){if(stroke.length){const p=stroke.at(-1);if(Math.hypot((x-p.x)*W,(y-p.y)*H)>70){tell('Pick up the green tip to keep drawing.');return false;}}else{if(x>.11||Math.abs(y-.57)>.13){tell('Start with the glowing dot on the left.');return false;}addPoint(x,y);document.body.classList.add('drawing-active');}drawing=true;return true;}
function pointerPosition(e){return{x:e.clientX/W,y:e.clientY/H};}
function isSky(x,y){return y<sampleLine(stroke,x)-.035;}
$('world').addEventListener('pointerdown',e=>{if(e.button!==0)return;if(quest?.pointer(e,'down')){$('world').setPointerCapture(e.pointerId);return;}if(moonChapter(flow.phase))return;const p=pointerPosition(e);if(flow.phase==='draw'){if(startStroke(p.x,p.y))$('world').setPointerCapture(e.pointerId);return;}if(plantingAllowed(flow.phase)&&!isSky(p.x,p.y)){if(plant(p.x,p.y)){brushing=true;lastBrush={...p,time:performance.now()};$('world').setPointerCapture(e.pointerId);}syncUI();return;}if(flow.phase==='sky'&&isSky(p.x,p.y)){flow.chooseSky(p.x,Math.min(p.y,sampleLine(stroke,p.x)-.07));syncUI();return;}if(['night','restored'].includes(flow.phase)&&isSky(p.x,p.y)){makeWish(p.x,p.y);return;}if(flow.phase==='plant')tell('Plant your roses in the grass below the horizon.');});
$('world').addEventListener('pointermove',e=>{if(quest?.pointer(e,'move'))return;const p=pointerPosition(e);if(drawing&&flow.phase==='draw'){const events=e.getCoalescedEvents?.()||[];for(const ce of events.length?events:[e]){if(flow.phase!=='draw')break;addPoint(ce.clientX/W,ce.clientY/H);}return;}if(brushing&&plantingAllowed(flow.phase)&&lastBrush&&Math.hypot((p.x-lastBrush.x)*W,(p.y-lastBrush.y)*H)>48&&performance.now()-lastBrush.time>170){if(plant(p.x,p.y))lastBrush={...p,time:performance.now()};syncUI();}if(flow.phase==='sky'&&isSky(p.x,p.y)){$('sky-cursor').style.left=e.clientX+'px';$('sky-cursor').style.top=clamp(p.y,.07,Math.min(.72,sampleLine(stroke,p.x)-.07))*H+'px';$('sky-cursor').style.opacity=1;}else $('sky-cursor').style.opacity=0;});
function endPointer(e){quest?.pointer(e,'up');if(drawing&&flow.phase==='draw'){$('instruction-text').textContent='Pick up the green tip and continue to the right.';}drawing=false;brushing=false;if($('world').hasPointerCapture(e.pointerId))$('world').releasePointerCapture(e.pointerId);}
$('world').addEventListener('pointerup',endPointer);$('world').addEventListener('pointercancel',endPointer);$('world').addEventListener('pointerleave',e=>{quest?.pointer(e,'leave');$('sky-cursor').style.opacity=0;});
$('keyboard').addEventListener('click',()=>{keyboardMode=true;if(!stroke.length)addPoint(.04,.57);document.body.classList.add('drawing-active');$('instruction-text').textContent='Hold → to draw. Use ↑ and ↓ to shape your hills.';$('instruction-detail').textContent='Reach the right edge to bring your landscape to life.';$('world').focus();});
$('world').addEventListener('keydown',e=>{if(flow.phase==='draw'&&keyboardMode&&['ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const p=stroke.at(-1)||{x:.04,y:.57};addPoint(p.x+(e.key==='ArrowRight'?.018:.007),p.y+(e.key==='ArrowUp'?-.012:e.key==='ArrowDown'?.012:0));}else if(keyboardMode&&['Enter',' '].includes(e.key)&&plantingAllowed(flow.phase)){e.preventDefault();keyboardAction();}});
let keyboardPlants=0;
function keyboardAction(){if(quest&&['search','mend'].includes(flow.phase)){const p=quest.state.position,point=new THREE.Vector3(p.x,soilHeight(p.x,p.z),p.z).project(camera);plant((point.x+1)/2,(1-point.y)/2);return;}const index=keyboardPlants++,positions=[[.22,.72],[.73,.7],[.45,.78],[.8,.84],[.13,.86],[.58,.66],[.35,.67],[.62,.88]],p=positions[index%8];plant(p[0],Math.max(p[1],sampleLine(stroke,p[0])+.07));syncUI();}
$('accessible-action').addEventListener('click',keyboardAction);
$('place-sun').addEventListener('click',()=>{flow.chooseSky(.7,.22);syncUI();});
$('wish-action').addEventListener('click',()=>makeWish(.2+random()*.6,.12+random()*.22));
function startMoonChapter(){quest?.dispose();extension?.dispose();brushing=false;
  worldBounds={...widthBounds,back:-22,front:13};worldSeed=stroke.reduce((n,p)=>Math.imul(n,31)+Math.round(p.y*10000),371)>>>0;
  extension=new MeadowStream({scene,garden:worldBounds,height:soilHeight,seed:worldSeed,groundMaterial:groundMat,grassMaterial:grassMat,blade,mobile:W<600});
  quest=new MoonQuest({scene,camera,groundHeight:soilHeight,bounds:extendedBounds(worldBounds),seed:worldSeed,roses,flow,reduced,onCollect:(id,count)=>{tell(count===8?'Every piece is here.':`Moon fragment found. ${count} of 8.`);pickupTone(count);}});extension.update(quest.origin);syncUI();
}
$('quest-hint').addEventListener('click',()=>quest?.hint());$('quest-assist').addEventListener('click',()=>quest?.assist());
$('pause').addEventListener('click',()=>{flow.paused=!flow.paused;$('pause').setAttribute('aria-pressed',String(flow.paused));$('pause').innerHTML=flow.paused?'CONTINUE <span>▷</span>':'PAUSE <span>Ⅱ</span>';});
$('restart').addEventListener('click',()=>{quest?.dispose();quest=null;extension?.dispose();extension=null;worldBounds=null;guideStrength.value=0;guideWind.value.set(0,0);flow.reset();stroke=[];drawing=false;brushing=false;keyboardMode=false;keyboardPlants=0;grassVisible=0;meadow.visible=false;for(const r of roses)meadow.remove(r.root);roses.length=0;comets.length=0;document.body.classList.remove('drawing-active','grown','night','moon-chapter','flying');$('quest-assist').hidden=true;$('drawn-line').setAttribute('d','');$('drawing-tip').style.opacity=0;$('drawing').style.opacity=1;$('pause').innerHTML='PAUSE <span>Ⅱ</span>';$('pause').setAttribute('aria-pressed','false');previousPhase='';syncUI();});

// The night sky is clipped to the player's actual horizon. Comets only spawn on a wish.
const ctx=$('starlight').getContext('2d'),stars=Array.from({length:330},()=>({x:random(),y:random()*.70,size:.4+random()*1.1,phase:random()*6.28})),comets=[];
function makeWish(x,y){if(flow.paused||!flow.wish())return;for(let i=0;i<5;i++)comets.push({x:x+(i?random()*.1-.05:0),y:y+(i?random()*.045-.022:0),age:-i*.13,life:1.55+random()*.45,speed:.18+random()*.14});if(comets.length>60)comets.splice(0,comets.length-60);$('action-count').textContent=flow.phase==='restored'?`${flow.comets} WISHES`:`${flow.comets} / ${COMET_TAPS}`;if(flow.phase==='shatter')startMoonChapter();}
const air=$('atmosphere').getContext('2d');
const clouds=[{x:.12,y:.17,w:.19},{x:.65,y:.08,w:.21},{x:.92,y:.32,w:.23},{x:.38,y:.38,w:.10}];
function paintAtmosphere(night){
  air.clearRect(0,0,W,H);
  if(!['collapse','orbit','night','restored'].includes(flow.phase)&&!moonChapter(flow.phase))return;
  const cloudLight=1-skyBlackout(flow.phase,flow.age,reduced);
  for(const c of clouds){
    const x=(c.x+Math.sin(clock*.015+c.y)*.02)*W,y=c.y*H,w=c.w*W,h=Math.min(w*.26,H*.075);
    const gradient=air.createLinearGradient(0,y-h,0,y+h);gradient.addColorStop(0,night>.5?'#c6c4ef':'#fffff0');gradient.addColorStop(1,night>.5?'#6566a0':'#acd6e2');
    air.globalAlpha=mix(.76,.21,night)*cloudLight;air.fillStyle=gradient;
    air.beginPath();air.moveTo(x-w*.65,y+h*.35);
    air.bezierCurveTo(x-w*.8,y-h*.1,x-w*.4,y-h*.8,x-w*.23,y-h*.4);
    air.bezierCurveTo(x-w*.3,y-h*1.8,x+w*.1,y-h*2,x+w*.22,y-h*.85);
    air.bezierCurveTo(x+w*.42,y-h*1.4,x+w*.6,y-h*.6,x+w*.53,y);
    air.bezierCurveTo(x+w*.9,y-h*.2,x+w*.93,y+h*.4,x+w*.65,y+h*.43);
    air.bezierCurveTo(x+w*.25,y+h*.6,x-w*.26,y+h*.5,x-w*.65,y+h*.35);air.fill();
    air.globalAlpha=mix(.3,.08,night)*cloudLight;air.strokeStyle='#fff8ed';air.lineWidth=2;air.beginPath();air.moveTo(x-w*.45,y+h*.1);air.bezierCurveTo(x-w*.15,y+h*.25,x+w*.2,y+h*.3,x+w*.45,y+h*.1);air.stroke();
  }
  air.globalAlpha=1;
}
function paintSky(dt,night){ctx.clearRect(0,0,W,H);const blackout=skyBlackout(flow.phase,flow.age,reduced);if(blackout>=1)return;night*=1-blackout;
  if(!['draw','land'].includes(flow.phase)){
    // Pollen becomes fireflies as the garden slips into blue hour.
    for(let i=0;i<36;i++){const s=stars[i],x=((s.x+clock*.008)%1)*W,y=(.61+((s.y+clock*.009)% .31))*H;if(y<sampleLine(stroke,x/W)*H+10)continue;
      ctx.globalAlpha=(.22+.36*night)*(.6+.4*Math.sin(clock+s.phase));ctx.fillStyle=night>.5?'#abffe4':'#fff3bb';ctx.shadowBlur=night> .5?8:3;ctx.shadowColor=ctx.fillStyle;ctx.beginPath();ctx.arc(x,y,1.2+night*.6,0,Math.PI*2);ctx.fill();}
    ctx.shadowBlur=0;ctx.globalAlpha=1;
  }
  if(night<.02)return;ctx.save();ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(W,0);for(let i=80;i>=0;i--)ctx.lineTo(i/80*W,sampleLine(stroke,i/80)*H-4);ctx.closePath();ctx.clip();const opacity=smooth(.2,.95,night);for(const s of stars){ctx.globalAlpha=opacity*(.45+.4*Math.sin(clock*.65+s.phase));ctx.fillStyle='#e8f4ff';ctx.beginPath();ctx.arc(s.x*W,s.y*H,s.size,0,Math.PI*2);ctx.fill();}
  ctx.globalAlpha=1;for(let i=comets.length-1;i>=0;i--){const c=comets[i];if(!flow.paused)c.age+=dt;if(c.age<0)continue;if(c.age>c.life){comets.splice(i,1);continue;}const t=c.age/c.life,fade=Math.sin(t*Math.PI),x=(c.x-c.age*c.speed)*W,y=(c.y+c.age*c.speed*.5)*H,tail=Math.min(c.age,.43);const tx=x+tail*c.speed*W,ty=y-tail*c.speed*.5*H;const gradient=ctx.createLinearGradient(x,y,tx,ty);gradient.addColorStop(0,`rgba(255,249,221,${fade})`);gradient.addColorStop(.25,`rgba(192,219,248,${fade*.65})`);gradient.addColorStop(1,'rgba(169,207,241,0)');ctx.strokeStyle=gradient;ctx.lineWidth=1.7;ctx.shadowColor='#d6eaff';ctx.shadowBlur=9;ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(x,y);ctx.stroke();ctx.fillStyle=`rgba(255,254,237,${fade})`;ctx.beginPath();ctx.arc(x,y,1.8,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}ctx.restore();}
function resize(){W=innerWidth;H=innerHeight;camera.aspect=W/H;camera.updateProjectionMatrix();camera.updateMatrixWorld();renderer.setSize(W,H);const ratio=Math.min(devicePixelRatio,1.7);for(const id of ['starlight','atmosphere']){$(id).width=Math.round(W*ratio);$(id).height=Math.round(H*ratio);}ctx.setTransform(ratio,0,0,ratio,0,0);air.setTransform(ratio,0,0,ratio,0,0);renderStroke();if(flow.phase!=='draw'&&!moonChapter(flow.phase)&&!extension){createLandscape();if(flow.phase!=='land')unfoldLand(1);}}
window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{last=performance.now();});

let audioCtx,audioGain,audioOn=false;
function pickupTone(count){if(!audioOn||!audioCtx)return;const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='sine';osc.frequency.value=392*Math.pow(2,count/12);gain.gain.setValueAtTime(0,audioCtx.currentTime);gain.gain.linearRampToValueAtTime(.055,audioCtx.currentTime+.025);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.7);osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+.8);}
$('sound').addEventListener('click',()=>{audioOn=!audioOn;if(audioOn&&!audioCtx){audioCtx=new AudioContext();audioGain=audioCtx.createGain();audioGain.gain.value=0;audioGain.connect(audioCtx.destination);[130.81,196,261.63,329.63].forEach((f,i)=>{const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.frequency.value=f;gain.gain.value=.025/(i+1);osc.connect(gain);gain.connect(audioGain);osc.start();});}if(audioCtx){audioCtx.resume();audioGain.gain.setTargetAtTime(audioOn?.55:0,audioCtx.currentTime,.6);}$('sound').classList.toggle('sound-on',audioOn);$('sound').setAttribute('aria-pressed',String(audioOn));$('sound').setAttribute('aria-label',audioOn?'Turn ambient sound off':'Turn ambient sound on');});
const dayTop=new THREE.Color('#72bbdf'),dayBottom=new THREE.Color('#f2f1c9'),nightTop=new THREE.Color('#101336'),nightBottom=new THREE.Color('#55567e'),topColor=new THREE.Color(),bottomColor=new THREE.Color(),soilDay=new THREE.Color(0x83ca87),soilNight=new THREE.Color(0x506c9a);
const sunsetTop=new THREE.Color('#aa87c7'),sunsetBottom=new THREE.Color('#ffb38e'),fogDay=new THREE.Color('#c0e7bf'),fogNight=new THREE.Color('#555b85'),grassDay=new THREE.Color('#9bd998'),grassNight=new THREE.Color('#6e91b1');
function place(element,p){element.style.left=p.x*W+'px';element.style.top=p.y*H+'px';}
function renderLight(){
  const chapter=moonChapter(flow.phase),lit=['collapse','orbit','night','restored'].includes(flow.phase)||chapter,travel=clamp(flow.orbitAge/SUNSET_SECONDS);
  const night=lit?smooth(.43,1,travel):0;
  const collapse=flow.phase==='collapse'?smooth(0,3.8/(reduced?5:1),flow.age):lit?1:0;
  topColor.copy(dayTop).lerp(sunsetTop,smooth(0,.66,travel)).lerp(nightTop,smooth(.65,1,travel));
  bottomColor.copy(dayBottom).lerp(sunsetBottom,smooth(0,.65,travel)).lerp(nightBottom,smooth(.65,1,travel));
  const blackout=skyBlackout(flow.phase,flow.age,reduced);
  topColor.lerp(new THREE.Color('#000103'),blackout);bottomColor.lerp(new THREE.Color('#000103'),blackout);$('sky').style.background=`linear-gradient(${topColor.getStyle()},${bottomColor.getStyle()} 85%)`;
  const chosen=flow.selected,t=smooth(0,1,travel),end={x:-.08,y:sampleLine(stroke,0)+.10},control={x:chosen.x*.5-.02,y:Math.min(chosen.y,.20)-.20};
  const sunP={x:(1-t)**2*chosen.x+2*(1-t)*t*control.x+t*t*end.x,y:(1-t)**2*chosen.y+2*(1-t)*t*control.y+t*t*end.y};
  const radius=mix(Math.hypot(W,H)*1.08,38,collapse);$('white-space').style.clipPath=lit?`circle(${radius}px at ${chosen.x*W}px ${chosen.y*H}px)`:'none';$('white-space').style.opacity=lit?1-smooth(.94,1,collapse):1;
  place($('sun'),sunP);$('sun').style.opacity=lit?smooth(.94,1,collapse)*(1-smooth(.89,1,travel)):0;
  $('sun').style.filter=`hue-rotate(${-travel*24}deg)`;
  const moonrise=moonRise(flow.phase,flow.age);place($('moon'),{x:mix(1.03,.78,moonrise),y:mix(.50,.21,moonrise)});
  if(chapter)place($('moon'),{x:.78,y:.21});
  $('moon').style.opacity=chapter?(flow.phase==='shatter'?1-smooth(.4,.75,flow.age):flow.phase==='restore'?smooth(.90,1,1-blackout):0):moonrise;
  const cracks=$('moon-cracks');place(cracks,{x:.78,y:.21});cracks.style.opacity=flow.phase==='shatter'?smooth(0,.25,flow.age)*(1-smooth(.4,.75,flow.age)):0;
  const reconstruction=flow.phase==='restore'?1-blackout:0;$('moon-target').style.width=mix(W<600?180:220,58,reconstruction)+'px';$('moon-target').style.left=mix(50,78,reconstruction)+'%';$('moon-target').style.top=mix(W<600?43:41,21,reconstruction)+'%';
  const lightNight=night*collapse;hemi.intensity=mix(1.8,.72,lightNight);sunLight.intensity=mix(1.6,.12,lightNight);moonLight.intensity=mix(.2,1.0,lightNight);sunLight.position.set((sunP.x-.5)*25,12*(1-travel)+3,8);
  sunLight.color.set('#fff0c6').lerp(new THREE.Color('#ffbca5'),smooth(0,.75,travel));
  groundMat.color.copy(soilDay).lerp(soilNight,lightNight);grassMat.color.copy(grassDay).lerp(grassNight,lightNight);scene.fog.color.copy(fogDay).lerp(fogNight,lightNight);
  hemi.color.set('#fff8ec').lerp(new THREE.Color('#a2b5ee'),lightNight);hemi.groundColor.set('#69a897').lerp(new THREE.Color('#3d4a82'),lightNight);
  hemi.intensity*=1-blackout;sunLight.intensity*=1-blackout;moonLight.intensity*=1-blackout;scene.fog.color.lerp(new THREE.Color('#000103'),blackout);scene.fog.density=mix(.013,.042,blackout);
  document.body.classList.toggle('night',lightNight>.56);return lightNight;
}
function animate(now){requestAnimationFrame(animate);const elapsed=(now-last)/1000,dt=Math.min(elapsed,.06);last=now;if(document.hidden)return;flow.tick(elapsed);if(!flow.paused)clock+=dt;syncUI();const speed=reduced?5:1;
  if(flow.phase==='land'){const growth=smooth(0,3.8/speed,flow.age);unfoldLand(growth);$('drawing').style.opacity=1-smooth(.04,.35,growth);$('drawing-tip').style.opacity=0;}
  else if(flow.phase!=='draw'){$('drawing').style.opacity=0;if(ground&&previousPhase==='grass'&&flow.age<dt*2)unfoldLand(1);}
  if(grass){grassVisible=flow.phase==='grass'?smooth(0,2.8/speed,flow.age):['draw','land'].includes(flow.phase)?0:1;grass.visible=grassVisible>0;grassGrowth.value=grassVisible;}
  wind.value=reduced?0:clock;document.body.classList.toggle('grown',!['draw','land'].includes(flow.phase)||(flow.phase==='land'&&flow.age>2/speed));
  for(const r of roses){if(!flow.paused)r.age+=dt;const open=reduced?1:smooth(0,1.8,r.age);r.root.visible=r.age>=0;r.root.scale.set(r.size*(.45+.55*open),r.size*open,r.size*(.45+.55*open));r.blossom.scale.setScalar(.25+.75*open);r.root.rotation.z=reduced?0:Math.sin(clock*.7+r.phase)*.014;}
  quest?.update(dt,clock);if(quest&&moonChapter(flow.phase)){extension?.update(flow.phase==='restore'?camera.position:quest.state.position);const direction=quest.state.windDirection();guideWind.value.set(direction.x,direction.z);guideStrength.value=flow.phase==='search'?quest.windStrength(clock):0;}else guideStrength.value=0;
  syncUI();const night=renderLight();paintAtmosphere(night);renderer.render(scene,camera);paintSky(dt,night);
}
resize();syncUI();requestAnimationFrame(animate);
window.roseStory={get state(){return{phase:flow.phase,patches:flow.patches,roses:roses.length,strokePoints:stroke.length,comets:flow.comets,angle:flow.angle,sunsetSeconds:flow.orbitAge,night:flow.phase==='night',drawCalls:renderer.info.render.calls};}};
