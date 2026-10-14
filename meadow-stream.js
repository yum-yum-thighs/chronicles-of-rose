import * as THREE from './vendor/three.module.min.js';
import {TILE_SIZE,tileSeed,seededRandom,insideGarden,visibleTiles} from './meadow-world.js';
// Only nearby tiles stay on the GPU. Revisiting a tile regenerates the same meadow.
export class MeadowStream{
  constructor({scene,garden,height,seed,groundMaterial,grassMaterial,blade,mobile}){Object.assign(this,{scene,garden,height,seed,groundMaterial,grassMaterial,blade,mobile});this.tiles=new Map();this.center='';}
  update(position){const center=`${Math.floor(position.x/TILE_SIZE)},${Math.floor(position.z/TILE_SIZE)}`;if(center===this.center)return;this.center=center;
    const wanted=visibleTiles(position),keys=new Set(wanted.map(t=>t.key));
    for(const [key,tile] of this.tiles)if(!keys.has(key)){this.remove(tile);this.tiles.delete(key);}
    for(const tile of wanted)if(!this.tiles.has(tile.key)){const group=this.create(tile.x,tile.z);this.tiles.set(tile.key,group);this.scene.add(group);}
  }
  create(tx,tz){const group=new THREE.Group(),x0=tx*TILE_SIZE,z0=tz*TILE_SIZE,positions=[],indices=[],steps=20;
    const axis=(start,borders)=>[...new Set([...Array.from({length:steps+1},(_,i)=>start+i),...borders.filter(b=>b>start&&b<start+TILE_SIZE)])].sort((a,b)=>a-b),xs=axis(x0,[this.garden.left,this.garden.right]),zs=axis(z0,[this.garden.back,this.garden.front]),stride=xs.length;
    for(const wz of zs)for(const wx of xs)positions.push(wx,this.height(wx,wz),wz);
    for(let z=0;z<zs.length-1;z++)for(let x=0;x<xs.length-1;x++){
      if(insideGarden((xs[x]+xs[x+1])/2,(zs[z]+zs[z+1])/2,this.garden))continue;
      const a=z*stride+x;indices.push(a,a+stride,a+1,a+1,a+stride,a+stride+1);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();group.add(new THREE.Mesh(geometry,this.groundMaterial));
    const rand=seededRandom(tileSeed(this.seed,tx,tz)),count=this.mobile?1500:2600,dummy=new THREE.Object3D(),color=new THREE.Color();
    const grass=new THREE.InstancedMesh(this.blade,this.grassMaterial,count);let used=0;
    for(let i=0;i<count;i++){const x=x0+rand()*TILE_SIZE,z=z0+rand()*TILE_SIZE;if(insideGarden(x,z,this.garden))continue;dummy.position.set(x,this.height(x,z),z);dummy.rotation.set(0,rand()*6.28,(rand()-.5)*.1);dummy.scale.set(.8+rand()*.55,.32+rand()*.68,1);dummy.updateMatrix();grass.setMatrixAt(used,dummy.matrix);color.setHSL(.25+rand()*.08,.46+rand()*.20,.33+rand()*.17);grass.setColorAt(used,color);used++;}
    grass.count=used;grass.instanceMatrix.needsUpdate=true;grass.computeBoundingSphere();group.add(grass);return group;
  }
  surfaces(){return [...this.tiles.values()].map(g=>g.children[0]);}
  remove(group){this.scene.remove(group);group.children[0].geometry.dispose();group.children[1].dispose();}
  dispose(){for(const tile of this.tiles.values())this.remove(tile);this.tiles.clear();this.center='';}
}
