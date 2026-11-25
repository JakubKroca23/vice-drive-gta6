import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSandPBR, createSkyscraperFacadePBR, createWetAsphaltPBR } from './textures';
import { getGroundHeight } from './ocean';

export interface StaticBoxDef {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  rotZ?: number;
}

export interface CityBuildResult {
  staticBoxes: StaticBoxDef[];
  neonMaterials: THREE.MeshStandardMaterial[];
  skyscraperMat: THREE.MeshStandardMaterial;
  setNeonIntensity: (strength: number) => void;
}

export function buildViceCity(scene: THREE.Scene): CityBuildResult {
  const staticBoxes: StaticBoxDef[] = [];
  const neonMaterials: THREE.MeshStandardMaterial[] = [];

  const asphaltTex = createWetAsphaltPBR(512);
  asphaltTex.map.repeat.set(1, 16);
  asphaltTex.roughnessMap.repeat.set(1, 16);
  asphaltTex.normalMap.repeat.set(1, 16);

  const sandTex = createSandPBR(256);
  sandTex.map.repeat.set(10, 48);
  sandTex.roughnessMap.repeat.set(10, 48);
  sandTex.normalMap.repeat.set(10, 48);

  const skyTex = createSkyscraperFacadePBR(512);
  skyTex.map.repeat.set(2, 4);
  skyTex.roughnessMap.repeat.set(2, 4);
  skyTex.normalMap.repeat.set(2, 4);
  if (skyTex.emissiveMap) skyTex.emissiveMap.repeat.set(2, 4);

  // 1) Wet Ocean Drive Asphalt + Cross Street + Starfish Island Plaza
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphaltTex.map,
    roughnessMap: asphaltTex.roughnessMap,
    normalMap: asphaltTex.normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 0.75,
    metalness: 0.08
  });

  const mainRoad = new THREE.Mesh(new THREE.BoxGeometry(28, 0.2, 320), roadMat);
  mainRoad.position.set(0, -0.02, 0);
  mainRoad.receiveShadow = true;
  scene.add(mainRoad);
  staticBoxes.push({ w: 28, h: 0.2, d: 320, x: 0, y: -0.02, z: 0 });

  // Cross Avenue (West inland + East causeway approach)
  const crossRoadMat = new THREE.MeshStandardMaterial({
    color: 0x242830,
    roughness: 0.48,
    metalness: 0.1
  });
  const crossRoad = new THREE.Mesh(new THREE.BoxGeometry(110, 0.18, 18), crossRoadMat);
  crossRoad.position.set(-40, -0.01, 0);
  crossRoad.receiveShadow = true;
  scene.add(crossRoad);
  staticBoxes.push({ w: 110, h: 0.18, d: 18, x: -40, y: -0.01, z: 0 });

  // Sidewalks & City Ground (merged)
  const sidewalkMat = new THREE.MeshStandardMaterial({
    color: 0xb9b2a8,
    roughness: 0.85,
    metalness: 0.04
  });
  const swGeos: THREE.BufferGeometry[] = [];
  const addMergedBox = (arr: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, addCollider = true) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    arr.push(g);
    if (addCollider) staticBoxes.push({ w, h, d, x, y, z });
  };

  // West sidewalk along hotels
  addMergedBox(swGeos, 6, 0.28, 320, -17, 0.08, 0);
  // East boardwalk promenade along beach
  addMergedBox(swGeos, 5, 0.28, 320, 16.5, 0.08, 0);
  // City base ground under skyscrapers
  addMergedBox(swGeos, 70, 0.3, 320, -54, -0.06, 0);
  // Starfish Island concrete plaza
  addMergedBox(swGeos, 48, 0.5, 54, 128, 0.0, 0);

  // Coastal Causeway Bridge (x = 18 -> 106, segmented arch so car drives smoothly over the ocean!)
  const bridgeSegs = 12;
  const bridgeStartX = 18;
  const bridgeEndX = 106;
  const segLen = (bridgeEndX - bridgeStartX) / bridgeSegs;
  for (let i = 0; i < bridgeSegs; i++) {
    const x0 = bridgeStartX + i * segLen;
    const x1 = x0 + segLen;
    const midX = (x0 + x1) * 0.5;
    const h0 = Math.sin((i / bridgeSegs) * Math.PI) * 2.5 + 0.24;
    const h1 = Math.sin(((i + 1) / bridgeSegs) * Math.PI) * 2.5 + 0.24;
    const midY = (h0 + h1) * 0.5;
    const angle = Math.atan2(h1 - h0, segLen);
    const len = Math.hypot(segLen, h1 - h0) + 0.15;

    const deck = new THREE.BoxGeometry(len, 0.45, 14);
    deck.rotateZ(angle);
    deck.translate(midX, midY - 0.12, 0);
    swGeos.push(deck);
    staticBoxes.push({ w: len, h: 0.45, d: 14, x: midX, y: midY - 0.12, z: 0, rotZ: angle });

    // Guardrails on bridge edges
    for (const gz of [-6.7, 6.7]) {
      const rail = new THREE.BoxGeometry(len, 0.75, 0.35);
      rail.rotateZ(angle);
      rail.translate(midX, midY + 0.4, gz);
      swGeos.push(rail);
      staticBoxes.push({ w: len, h: 0.75, d: 0.35, x: midX, y: midY + 0.4, z: gz, rotZ: angle });
    }
  }

  // Two Stunt Jump Ramps!
  // Ramp 1: Ocean Drive Stunt Ramp (x = 6.5, z = -34)
  const makeRamp = (rx: number, ry: number, rz: number, rw: number, rh: number, rd: number, rotXDeg: number) => {
    const ang = THREE.MathUtils.degToRad(rotXDeg);
    const rMesh = new THREE.Mesh(
      new THREE.BoxGeometry(rw, rh, rd),
      new THREE.MeshStandardMaterial({ color: 0xff9b26, roughness: 0.5, metalness: 0.2 })
    );
    rMesh.position.set(rx, ry, rz);
    rMesh.rotation.x = ang;
    rMesh.castShadow = true;
    rMesh.receiveShadow = true;
    scene.add(rMesh);

    // Rapier ramp collider handled via physics helper or approximated rotated box
    // Let's push a slightly stepped or exact ramp via addRamp in physics.ts? Better: return ramp list or handle in city!
    return { w: rw, h: rh, d: rd, x: rx, y: ry, z: rz, rotX: ang };
  };
  const ramp1 = makeRamp(6.5, 0.72, -34, 5.2, 0.35, 9.5, -14);
  const ramp2 = makeRamp(27.0, 0.95, -62, 6.5, 0.35, 11.0, -16);
  // Store ramps in userData on scene so physics.ts reads exact rotX ramps
  scene.userData.stuntRamps = [ramp1, ramp2];

  const mergedCityBase = mergeGeometries(swGeos, false);
  const cityBaseMesh = new THREE.Mesh(mergedCityBase, sidewalkMat);
  cityBaseMesh.receiveShadow = true;
  cityBaseMesh.castShadow = true;
  scene.add(cityBaseMesh);

  // 2) Sculpted Beach Sand Mesh (x = 16..56, z = -160..160)
  const sandGeo = new THREE.PlaneGeometry(46, 320, 32, 80);
  sandGeo.rotateX(-Math.PI / 2);
  sandGeo.translate(39, 0, 0);
  const sPos = sandGeo.attributes.position;
  for (let i = 0; i < sPos.count; i++) {
    const x = sPos.getX(i);
    const z = sPos.getZ(i);
    sPos.setY(i, getGroundHeight(x, z));
  }
  sandGeo.computeVertexNormals();
  const sandMat = new THREE.MeshStandardMaterial({
    map: sandTex.map,
    roughnessMap: sandTex.roughnessMap,
    normalMap: sandTex.normalMap,
    roughness: 0.88,
    metalness: 0.02
  });
  const sandMesh = new THREE.Mesh(sandGeo, sandMat);
  sandMesh.receiveShadow = true;
  scene.add(sandMesh);

  // 3) Art Deco Ocean Drive Hotels & Glass Skyscrapers
  const skyscraperMat = new THREE.MeshStandardMaterial({
    map: skyTex.map,
    roughnessMap: skyTex.roughnessMap,
    normalMap: skyTex.normalMap,
    emissiveMap: skyTex.emissiveMap,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.5,
    roughness: 0.25,
    metalness: 0.65
  });

  const pastelColors = [0xf4e4d7, 0xf8c8dc, 0xb8f0e4, 0xffe2b0, 0xd7e3fc];
  const neonPalette = [0xff2a9d, 0x00f2ff, 0xffaa2b, 0x8d5cff];

  neonPalette.forEach((hex) => {
    neonMaterials.push(
      new THREE.MeshStandardMaterial({
        color: hex,
        emissive: hex,
        emissiveIntensity: 2.2,
        roughness: 0.2
      })
    );
  });

  const decoGeos: THREE.BufferGeometry[] = [];
  const tallGeos: THREE.BufferGeometry[] = [];
  const neonGeosByIdx: THREE.BufferGeometry[][] = neonPalette.map(() => []);

  // Art Deco Hotels lining Ocean Drive (West side x = -25)
  const hotelZ = [-128, -96, -64, -30, 28, 60, 94, 128];
  hotelZ.forEach((hz, idx) => {
    const w = 13 + (idx % 3) * 2;
    const h = 11 + (idx % 4) * 3.5;
    const d = 19 + (idx % 2) * 4;
    const bx = -20 - w * 0.5;
    addMergedBox(decoGeos, w, h, d, bx, h * 0.5, hz);

    // Art Deco stepped parapet crown
    addMergedBox(decoGeos, w * 0.72, 2.6, d * 0.65, bx, h + 1.3, hz, false);

    // Glowing HDR Neon Sign bands on hotel facade facing Ocean Drive!
    const nIdx = idx % neonMaterials.length;
    const strip1 = new THREE.BoxGeometry(0.28, 0.32, d * 0.88);
    strip1.translate(bx + w * 0.5 + 0.14, h - 0.6, hz);
    neonGeosByIdx[nIdx].push(strip1);

    const strip2 = new THREE.BoxGeometry(0.28, 3.8, 0.45);
    strip2.translate(bx + w * 0.5 + 0.14, h * 0.62, hz);
    neonGeosByIdx[(nIdx + 1) % neonMaterials.length].push(strip2);

    // Ground floor awning
    addMergedBox(decoGeos, 2.4, 0.28, d * 0.85, bx + w * 0.5 + 1.1, 3.4, hz, false);
  });

  const decoMat = new THREE.MeshStandardMaterial({
    color: pastelColors[0],
    roughness: 0.72,
    metalness: 0.08
  });
  const decoMesh = new THREE.Mesh(mergeGeometries(decoGeos, false), decoMat);
  decoMesh.castShadow = true;
  decoMesh.receiveShadow = true;
  scene.add(decoMesh);

  // Glass Skyscrapers in background (x = -46..-68)
  const towerPositions = [
    [-48, -110, 18, 48, 22], [-52, -72, 20, 62, 20], [-46, -34, 16, 42, 18],
    [-48, 32, 18, 54, 20], [-54, 72, 22, 68, 24], [-46, 112, 17, 45, 20],
    [-72, -45, 22, 76, 24], [-72, 48, 24, 82, 26]
  ];
  towerPositions.forEach(([tx, tz, tw, th, td], idx) => {
    addMergedBox(tallGeos, tw, th, td, tx, th * 0.5, tz);
    // Glowing rooftop neon crown
    const nIdx = (idx + 1) % neonMaterials.length;
    const crown = new THREE.BoxGeometry(tw + 0.3, 0.55, td + 0.3);
    crown.translate(tx, th - 0.5, tz);
    neonGeosByIdx[nIdx].push(crown);
  });

  const towersMesh = new THREE.Mesh(mergeGeometries(tallGeos, false), skyscraperMat);
  towersMesh.castShadow = true;
  towersMesh.receiveShadow = true;
  scene.add(towersMesh);

  neonGeosByIdx.forEach((geos, i) => {
    if (geos.length > 0) {
      const m = new THREE.Mesh(mergeGeometries(geos, false), neonMaterials[i]);
      scene.add(m);
    }
  });

  // 4) Instanced Palm Trees (110 palms -> 2 draw calls!)
  const palmPositions: Array<[number, number, number]> = [];
  for (let z = -140; z <= 140; z += 14) {
    if (Math.abs(z) < 12) continue; // keep cross street clear
    palmPositions.push([-14.6, 0.22, z]);
    palmPositions.push([15.4, 0.22, z + 5]);
    if (Math.abs(z) % 28 === 0) {
      palmPositions.push([22.5, getGroundHeight(22.5, z), z - 3]);
    }
  }
  // Island palms
  [[-16, -16], [16, -16], [-16, 16], [16, 16]].forEach(([ox, oz]) => {
    palmPositions.push([128 + ox, 0.25, oz]);
  });

  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.26, 7.2, 7);
  trunkGeo.translate(0, 3.6, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a523e, roughness: 0.92 });
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, palmPositions.length);
  trunkInst.castShadow = true;

  // Radial star-shaped palm frond canopy merged into 1 geometry
  const frondGeos: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 7; f++) {
    const ang = (f / 7) * Math.PI * 2;
    const fg = new THREE.BoxGeometry(0.65, 0.08, 3.4);
    fg.translate(0, 0, 1.7);
    fg.rotateX(0.32);
    fg.rotateY(ang);
    frondGeos.push(fg);
  }
  const canopyGeo = mergeGeometries(frondGeos, false);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x266a2e, roughness: 0.72, side: THREE.DoubleSide });
  const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, palmPositions.length);
  canopyInst.castShadow = true;

  const dummy = new THREE.Object3D();
  palmPositions.forEach(([px, py, pz], i) => {
    const lean = ((i % 5) - 2) * 0.04;
    const sc = 0.85 + (i % 4) * 0.12;
    dummy.position.set(px, py, pz);
    dummy.rotation.set(lean, i * 1.1, lean * 0.7);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(px - Math.sin(lean * 0.7) * 0.4, py + 7.1 * sc, pz + Math.sin(lean) * 0.4);
    dummy.updateMatrix();
    canopyInst.setMatrixAt(i, dummy.matrix);
  });
  scene.add(trunkInst);
  scene.add(canopyInst);

  // 5) Instanced Streetlights along Ocean Drive & Bridge
  const lampPositions: Array<[number, number, number, number]> = [];
  for (let z = -135; z <= 135; z += 22) {
    if (Math.abs(z) < 11) continue;
    lampPositions.push([-14.5, 0.22, z, 0]);
    lampPositions.push([14.5, 0.22, z, Math.PI]);
  }
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.11, 6.2, 6);
  poleGeo.translate(0, 3.1, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x222730, metalness: 0.8, roughness: 0.35 });
  const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, lampPositions.length);

  const bulbGeo = new THREE.BoxGeometry(0.95, 0.14, 0.32);
  bulbGeo.translate(0.45, 6.18, 0);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffd79e,
    emissive: 0xffa64d,
    emissiveIntensity: 2.6
  });
  neonMaterials.push(bulbMat);
  const bulbInst = new THREE.InstancedMesh(bulbGeo, bulbMat, lampPositions.length);

  lampPositions.forEach(([lx, ly, lz, rotY], i) => {
    dummy.position.set(lx, ly, lz);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);
    bulbInst.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poleInst);
  scene.add(bulbInst);

  // 6) Starfish Island Helipad Ring + Beach Umbrellas
  const heliRing = new THREE.Mesh(
    new THREE.RingGeometry(5.5, 6.3, 36),
    neonMaterials[1]
  );
  heliRing.rotation.x = -Math.PI / 2;
  heliRing.position.set(128, 0.28, 0);
  scene.add(heliRing);

  const umbGeo = new THREE.ConeGeometry(1.5, 0.65, 8);
  const umbMat = new THREE.MeshStandardMaterial({ color: 0xff4f8b, roughness: 0.7 });
  const umbInst = new THREE.InstancedMesh(umbGeo, umbMat, 14);
  umbInst.castShadow = true;
  for (let i = 0; i < 14; i++) {
    const ux = 24 + (i % 2) * 4.5;
    const uz = -110 + i * 16;
    const uy = getGroundHeight(ux, uz) + 2.0;
    dummy.position.set(ux, uy, uz);
    dummy.rotation.set(0.08, i, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    umbInst.setMatrixAt(i, dummy.matrix);
  }
  scene.add(umbInst);

  return {
    staticBoxes,
    neonMaterials,
    skyscraperMat,
    setNeonIntensity(strength: number) {
      neonMaterials.forEach((m) => { m.emissiveIntensity = strength; });
      skyscraperMat.emissiveIntensity = strength * 0.72;
    }
  };
}
