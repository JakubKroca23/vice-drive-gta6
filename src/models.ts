import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PBRTexSet } from './textures';

export function createDetailedWheel(
  radius = 0.38,
  width = 0.28,
  caliperColor = 0xff1e42
): THREE.Group {
  const wg = new THREE.Group();

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x16191e,
    roughness: 0.72,
    metalness: 0.05
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xe8eef6,
    metalness: 0.94,
    roughness: 0.14
  });
  const discMat = new THREE.MeshStandardMaterial({
    color: 0x8f99a6,
    metalness: 0.88,
    roughness: 0.28
  });
  const caliperMat = new THREE.MeshStandardMaterial({
    color: caliperColor,
    metalness: 0.4,
    roughness: 0.25
  });

  // Rounded radial tire profile via LatheGeometry
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(radius * 0.63, -width * 0.44),
    new THREE.Vector2(radius * 0.92, -width * 0.49),
    new THREE.Vector2(radius, -width * 0.36),
    new THREE.Vector2(radius, width * 0.36),
    new THREE.Vector2(radius * 0.92, width * 0.49),
    new THREE.Vector2(radius * 0.63, width * 0.44)
  ];
  const tireGeo = new THREE.LatheGeometry(pts, 28);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = true;
  wg.add(tire);

  // Outer alloy lip + center hub + 10 radial spokes merged
  const rimParts: THREE.BufferGeometry[] = [];
  const outerLip = new THREE.TorusGeometry(radius * 0.62, 0.025, 8, 24);
  outerLip.rotateY(Math.PI / 2);
  rimParts.push(outerLip);

  const hub = new THREE.CylinderGeometry(radius * 0.17, radius * 0.17, width * 0.62, 14);
  hub.rotateZ(Math.PI / 2);
  rimParts.push(hub);

  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const spoke = new THREE.BoxGeometry(0.035, radius * 0.45, 0.032);
    spoke.translate(width * 0.18, radius * 0.38, 0);
    spoke.rotateX(ang);
    rimParts.push(spoke);
    // Symmetric inner face so spokes look good from both left & right sides
    const spoke2 = new THREE.BoxGeometry(0.035, radius * 0.45, 0.032);
    spoke2.translate(-width * 0.18, radius * 0.38, 0);
    spoke2.rotateX(ang);
    rimParts.push(spoke2);
  }
  const rimMesh = new THREE.Mesh(mergeGeometries(rimParts, false), rimMat);
  wg.add(rimMesh);

  // Ventilated brake rotor disc & caliper
  const discGeo = new THREE.CylinderGeometry(radius * 0.48, radius * 0.48, 0.04, 18);
  discGeo.rotateZ(Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, discMat);
  wg.add(disc);

  const calGeo = new THREE.BoxGeometry(0.11, 0.14, 0.09);
  const cal = new THREE.Mesh(calGeo, caliperMat);
  cal.position.set(0, radius * 0.28, -radius * 0.25);
  wg.add(cal);

  return wg;
}

export interface SupercarVisuals {
  group: THREE.Group;
  tailMat: THREE.MeshStandardMaterial;
  underglowStrip: THREE.Mesh;
  underglowLight: THREE.PointLight;
  flames: THREE.Mesh[];
  wheels: THREE.Group[];
}

export function createDetailedSupercarModel(carbonTex: PBRTexSet, isMobile: boolean): SupercarVisuals {
  const group = new THREE.Group();

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: 0xff1675,
    metalness: 0.78,
    roughness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.035
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    map: carbonTex.map,
    normalMap: carbonTex.normalMap,
    roughnessMap: carbonTex.roughnessMap,
    roughness: 0.32,
    metalness: 0.45
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x111318,
    roughness: 0.5,
    metalness: 0.4
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0c1622,
    roughness: 0.03,
    metalness: 0.15,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.78
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xf2f5fa,
    metalness: 0.98,
    roughness: 0.08
  });

  // 1) Sculpted Aerodynamic Lower Body via ExtrudeGeometry (side profile: x=car Z, y=car Y)
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-2.26, -0.18);
  bodyShape.lineTo(2.15, -0.20);   // underbody floor
  bodyShape.lineTo(2.34, -0.08);   // aggressive front nose tip
  bodyShape.quadraticCurveTo(2.26, 0.18, 1.82, 0.26); // sloped nose -> hood
  bodyShape.lineTo(0.85, 0.35);    // cowl base of windshield
  bodyShape.lineTo(0.25, 0.38);    // beltline
  bodyShape.lineTo(-1.15, 0.40);   // rear haunch rise
  bodyShape.lineTo(-2.12, 0.36);   // rear deck
  bodyShape.lineTo(-2.28, 0.14);   // kammback tail
  bodyShape.lineTo(-2.26, -0.18);

  const bodyW = 1.84;
  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: bodyW,
    bevelEnabled: true,
    bevelThickness: 0.13,
    bevelSize: 0.11,
    bevelSegments: 4,
    curveSegments: 10
  });
  bodyGeo.translate(0, 0, -bodyW * 0.5);
  bodyGeo.rotateY(-Math.PI / 2);
  const bodyMesh = new THREE.Mesh(bodyGeo, paintMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // 2) Sculpted Greenhouse / Glass Canopy + Roof Spine
  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(-1.35, 0.34);
  canopyShape.lineTo(0.95, 0.32);
  canopyShape.quadraticCurveTo(0.45, 0.78, -0.05, 0.80); // sleek windshield -> apex
  canopyShape.lineTo(-0.55, 0.78);
  canopyShape.quadraticCurveTo(-1.05, 0.62, -1.35, 0.34); // fastback rear glass

  const canopyW = 1.44;
  const canopyGeo = new THREE.ExtrudeGeometry(canopyShape, {
    depth: canopyW,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 3
  });
  canopyGeo.translate(0, 0, -canopyW * 0.5);
  canopyGeo.rotateY(-Math.PI / 2);
  const canopyMesh = new THREE.Mesh(canopyGeo, glassMat);
  canopyMesh.castShadow = true;
  group.add(canopyMesh);

  // Interior Bucket Seats + Dashboard visible through glass
  const seatGeo = new THREE.BoxGeometry(0.42, 0.44, 0.34);
  [-0.36, 0.36].forEach((sx) => {
    const seat = new THREE.Mesh(seatGeo, darkTrimMat);
    seat.position.set(sx, 0.36, -0.25);
    seat.rotation.x = -0.22;
    group.add(seat);
  });
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.18, 0.35), darkTrimMat);
  dash.position.set(0, 0.36, 0.42);
  group.add(dash);

  // 3) Sculpted Wheel Arch Fender Flares + Dark Inner Wheel Wells
  const archGeo = new THREE.TorusGeometry(0.46, 0.075, 8, 18, Math.PI);
  archGeo.rotateY(Math.PI / 2);
  const wellGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.34, 16, 1, false, 0, Math.PI);
  wellGeo.rotateZ(Math.PI / 2);
  const wheelZ = [1.45, -1.42];
  wheelZ.forEach((wz) => {
    [-0.96, 0.96].forEach((wx) => {
      const flare = new THREE.Mesh(archGeo, paintMat);
      flare.position.set(wx > 0 ? 0.98 : -0.98, -0.08, wz);
      group.add(flare);

      const well = new THREE.Mesh(wellGeo, darkTrimMat);
      well.position.set(wx * 0.9, -0.08, wz);
      group.add(well);
    });
  });

  // 4) Carbon Fiber Aero Package: Front Splitter, Side Skirts, Rear Diffuser & GT Swan-Neck Wing
  const carbonParts: THREE.BufferGeometry[] = [];
  const splitter = new THREE.BoxGeometry(2.08, 0.06, 0.55);
  splitter.translate(0, -0.25, 2.18);
  carbonParts.push(splitter);

  [-0.98, 0.98].forEach((sx) => {
    const skirt = new THREE.BoxGeometry(0.16, 0.08, 2.25);
    skirt.translate(sx, -0.24, 0.02);
    carbonParts.push(skirt);
  });

  const diffuser = new THREE.BoxGeometry(1.78, 0.16, 0.42);
  diffuser.translate(0, -0.18, -2.20);
  carbonParts.push(diffuser);
  for (let f = -0.6; f <= 0.6; f += 0.3) {
    const fin = new THREE.BoxGeometry(0.04, 0.16, 0.36);
    fin.translate(f, -0.22, -2.26);
    carbonParts.push(fin);
  }

  // Swan-neck wing blade + curved uprights
  const wingBlade = new THREE.BoxGeometry(2.06, 0.055, 0.36);
  wingBlade.rotateX(-0.11);
  wingBlade.translate(0, 0.78, -2.08);
  carbonParts.push(wingBlade);
  [-0.7, 0.7].forEach((wx) => {
    const endplate = new THREE.BoxGeometry(0.04, 0.22, 0.44);
    endplate.translate(wx * 1.46, 0.75, -2.08);
    carbonParts.push(endplate);
    const strut = new THREE.BoxGeometry(0.05, 0.44, 0.14);
    strut.rotateX(0.18);
    strut.translate(wx * 0.75, 0.56, -1.96);
    carbonParts.push(strut);
  });

  const carbonMesh = new THREE.Mesh(mergeGeometries(carbonParts, false), carbonMat);
  carbonMesh.castShadow = true;
  group.add(carbonMesh);

  // 5) Side Mirrors & Front Grille Intake
  [-1.04, 1.04].forEach((mx) => {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 0.16), paintMat);
    mirror.position.set(mx, 0.38, 0.68);
    group.add(mirror);
  });
  const frontIntake = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.18, 0.12), darkTrimMat);
  frontIntake.position.set(0, -0.12, 2.34);
  group.add(frontIntake);

  // 6) Quad Chrome Exhaust Tips
  const exGeo = new THREE.CylinderGeometry(0.058, 0.062, 0.22, 12);
  exGeo.rotateX(Math.PI / 2);
  [-0.62, -0.48, 0.48, 0.62].forEach((ex) => {
    const pipe = new THREE.Mesh(exGeo, chromeMat);
    pipe.position.set(ex, -0.14, -2.35);
    group.add(pipe);
  });

  // 7) Multi-Element LED Headlights + Real SpotLight
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xdff6ff,
    emissiveIntensity: 3.8
  });
  [-0.72, 0.72].forEach((hx) => {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.16), darkTrimMat);
    housing.position.set(hx, 0.11, 2.24);
    const drl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.045, 0.08), headMat);
    drl.position.set(hx, 0.11, 2.31);
    group.add(housing, drl);
  });

  const headlightSpot = new THREE.SpotLight(0xeef8ff, isMobile ? 0 : 18, 48, Math.PI * 0.24, 0.48, 1.4);
  headlightSpot.position.set(0, 0.35, 2.3);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, -0.6, 20);
  group.add(headlightSpot, spotTarget);
  headlightSpot.target = spotTarget;

  // 8) Wraparound LED Taillight Blade
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff143c,
    emissive: 0xff143c,
    emissiveIntensity: 2.3
  });
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.07, 0.08), tailMat);
  tailBar.position.set(0, 0.22, -2.32);
  group.add(tailBar);

  // 9) Underglow & Nitro Flames
  const underglowMat = new THREE.MeshStandardMaterial({
    color: 0x00f2ff,
    emissive: 0x00f2ff,
    emissiveIntensity: 3.2
  });
  const underglowStrip = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.03, 3.6), underglowMat);
  underglowStrip.position.set(0, -0.26, 0);
  const underglowLight = new THREE.PointLight(0x00f2ff, 4.5, 9, 1.8);
  underglowLight.position.set(0, -0.32, 0);
  group.add(underglowStrip, underglowLight);

  const flameMat = new THREE.MeshBasicMaterial({ color: 0x38f2ff, transparent: true, opacity: 0.9 });
  const flames: THREE.Mesh[] = [];
  [-0.55, 0.55].forEach((ex) => {
    const fg = new THREE.ConeGeometry(0.10, 0.78, 10);
    fg.rotateX(-Math.PI / 2);
    const fm = new THREE.Mesh(fg, flameMat);
    fm.position.set(ex, -0.14, -2.65);
    fm.visible = false;
    group.add(fm);
    flames.push(fm);
  });

  // 10) Detailed 10-spoke Alloy Wheels
  const wheels: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const w = createDetailedWheel(0.38, 0.28, 0xff1675);
    group.add(w);
    wheels.push(w);
  }

  return { group, tailMat, underglowStrip, underglowLight, flames, wheels };
}

export function createTrafficCarModel(
  colorHex: number,
  style: 'coupe' | 'suv' | 'convertible',
  dirZ: 1 | -1
): THREE.Group {
  const grp = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({
    color: colorHex,
    metalness: 0.68,
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x101824,
    roughness: 0.05,
    metalness: 0.2,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.82
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0x181b22, roughness: 0.5 });

  // Lower sculpted body profile
  const s = new THREE.Shape();
  const isSUV = style === 'suv';
  const lenHalf = isSUV ? 2.25 : 2.15;
  const deckY = isSUV ? 0.82 : 0.68;

  s.moveTo(-lenHalf, 0.22);
  s.lineTo(lenHalf, 0.22);
  s.lineTo(lenHalf + 0.1, 0.45);
  s.quadraticCurveTo(lenHalf, 0.65, lenHalf * 0.55, deckY);
  s.lineTo(-lenHalf * 0.85, deckY + 0.05);
  s.lineTo(-lenHalf, 0.45);
  s.closePath();

  const bw = 1.78;
  const bGeo = new THREE.ExtrudeGeometry(s, {
    depth: bw,
    bevelEnabled: true,
    bevelThickness: 0.10,
    bevelSize: 0.09,
    bevelSegments: 3
  });
  bGeo.translate(0, 0, -bw * 0.5);
  bGeo.rotateY(-Math.PI / 2);
  const body = new THREE.Mesh(bGeo, paint);
  body.castShadow = true;
  grp.add(body);

  // Cabin / Windshield
  if (style === 'convertible') {
    const ws = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.42, 0.10), glass);
    ws.position.set(0, 0.88, 0.62);
    ws.rotation.x = -0.58;
    grp.add(ws);
    [-0.36, 0.36].forEach((sx) => {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.3), trim);
      seat.position.set(sx, 0.78, -0.25);
      grp.add(seat);
    });
  } else {
    const cs = new THREE.Shape();
    const roofH = isSUV ? 1.48 : 1.24;
    cs.moveTo(-1.35, deckY);
    cs.lineTo(0.85, deckY);
    cs.lineTo(0.32, roofH);
    cs.lineTo(isSUV ? -1.15 : -0.78, roofH);
    cs.closePath();
    const cw = 1.46;
    const cGeo = new THREE.ExtrudeGeometry(cs, {
      depth: cw,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 2
    });
    cGeo.translate(0, 0, -cw * 0.5);
    cGeo.rotateY(-Math.PI / 2);
    const cabin = new THREE.Mesh(cGeo, glass);
    cabin.castShadow = true;
    grp.add(cabin);
  }

  // Headlights & Taillights oriented along +Z (group rotates PI if dirZ === -1)
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 3.2 });
  const tlMat = new THREE.MeshStandardMaterial({ color: 0xff1e38, emissive: 0xff142a, emissiveIntensity: 2.5 });
  const fz = lenHalf + 0.11;
  const rz = -(lenHalf + 0.08);
  [-0.64, 0.64].forEach((lx) => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.08), hlMat);
    hl.position.set(lx, 0.52, fz);
    grp.add(hl);
  });
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.11, 0.08), tlMat);
  tl.position.set(0, 0.58, rz);
  grp.add(tl);

  // Wheels
  const wheelR = isSUV ? 0.42 : 0.36;
  [[-0.92, wheelR, 1.35], [0.92, wheelR, 1.35], [-0.92, wheelR, -1.35], [0.92, wheelR, -1.35]].forEach(([wx, wy, wz]) => {
    const w = createDetailedWheel(wheelR, 0.25, 0xffaa2b);
    w.position.set(wx, wy, wz);
    grp.add(w);
  });

  if (dirZ === -1) {
    grp.rotation.y = Math.PI;
  }

  return grp;
}

export function createCurvedPalmGeometries(): { trunkGeo: THREE.BufferGeometry; crownGeo: THREE.BufferGeometry } {
  // Curved natural coconut palm trunk via TubeGeometry + radius taper
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.32, 2.4, 0.12),
    new THREE.Vector3(0.58, 5.2, 0.18),
    new THREE.Vector3(0.35, 7.6, 0.05)
  ]);
  const trunkGeo = new THREE.TubeGeometry(curve, 14, 0.24, 8, false);
  const tPos = trunkGeo.attributes.position;
  for (let i = 0; i < tPos.count; i++) {
    const y = tPos.getY(i);
    const t = Math.max(0, Math.min(1, y / 7.6));
    const center = curve.getPointAt(t);
    const taper = 1.18 - t * 0.62;
    tPos.setXYZ(
      i,
      center.x + (tPos.getX(i) - center.x) * taper,
      y,
      center.z + (tPos.getZ(i) - center.z) * taper
    );
  }
  trunkGeo.computeVertexNormals();

  // Feathered palm fronds (11 arching stems with angled leaflets)
  const crownParts: THREE.BufferGeometry[] = [];
  const frondCount = 11;
  for (let f = 0; f < frondCount; f++) {
    const yaw = (f / frondCount) * Math.PI * 2 + (f % 2) * 0.18;
    const droopTier = f % 2 === 0 ? 0.0 : -0.22;
    const len = 3.6 + (f % 3) * 0.35;

    // Curved rachis stem
    const stemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.55 + droopTier * 0.4, len * 0.35),
      new THREE.Vector3(0, 0.22 + droopTier, len * 0.72),
      new THREE.Vector3(0, -0.55 + droopTier * 1.3, len)
    ]);
    const stem = new THREE.TubeGeometry(stemCurve, 6, 0.032, 4, false);
    stem.rotateY(yaw);
    crownParts.push(stem);

    // Leaflets along both sides of the arching stem
    for (let k = 1; k <= 9; k++) {
      const u = k / 10;
      const pt = stemCurve.getPointAt(u);
      const bladeLen = Math.sin(u * Math.PI) * 0.95 + 0.28;
      [-1, 1].forEach((side) => {
        const blade = new THREE.BoxGeometry(bladeLen, 0.018, 0.13);
        blade.translate(side * bladeLen * 0.5, 0, 0);
        blade.rotateZ(side * -0.45); // natural V-droop
        blade.rotateY(side * -0.35); // swept forward
        blade.translate(pt.x, pt.y, pt.z);
        blade.rotateY(yaw);
        crownParts.push(blade);
      });
    }
  }
  const crownGeo = mergeGeometries(crownParts, false);
  crownGeo.translate(0.35, 7.6, 0.05);
  return { trunkGeo, crownGeo };
}

export interface HumanRig {
  root: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  head: THREE.Group;
}

export function createArticulatedHumanRig(
  shirtColor: number,
  pantsColor: number,
  skinColor = 0xe8b590,
  hairColor = 0x1d1614
): HumanRig {
  const root = new THREE.Group();

  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.65 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.72 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.55 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.75 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f9, roughness: 0.45 });
  const shadesMat = new THREE.MeshPhysicalMaterial({ color: 0x090b10, roughness: 0.05, metalness: 0.6, clearcoat: 1 });

  // Pelvis & Torso
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.22), pantsMat);
  pelvis.position.y = 0.88;
  pelvis.castShadow = true;
  root.add(pelvis);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.17, 0.52, 10), shirtMat);
  torso.scale.set(1.05, 1, 0.68);
  torso.position.y = 1.20;
  torso.castShadow = true;
  root.add(torso);

  // Head + Hair + Aviator Sunglasses
  const head = new THREE.Group();
  head.position.set(0, 1.54, 0);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8), skinMat);
  neck.position.y = -0.02;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), skinMat);
  skull.scale.set(0.92, 1.08, 0.96);
  skull.position.y = 0.11;
  skull.castShadow = true;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.142, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
  hair.position.set(0, 0.13, -0.01);
  const shades = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.048, 0.06), shadesMat);
  shades.position.set(0, 0.12, 0.11);
  head.add(neck, skull, hair, shades);
  root.add(head);

  // Arms
  const makeArm = (side: -1 | 1) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.25, 1.40, 0);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.18, 8), shirtMat);
    sleeve.position.y = -0.09;
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.34, 8), skinMat);
    forearm.position.y = -0.34;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skinMat);
    hand.position.y = -0.52;
    sleeve.castShadow = forearm.castShadow = true;
    armPivot.add(sleeve, forearm, hand);
    root.add(armPivot);
    return armPivot;
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // Legs
  const makeLeg = (side: -1 | 1) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.105, 0.84, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.064, 0.42, 8), pantsMat);
    thigh.position.y = -0.21;
    const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.048, 0.38, 8), skinMat);
    calf.position.y = -0.58;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.22), shoeMat);
    shoe.position.set(0, -0.80, 0.04);
    thigh.castShadow = calf.castShadow = shoe.castShadow = true;
    legPivot.add(thigh, calf, shoe);
    root.add(legPivot);
    return legPivot;
  };
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  return { root, leftArm, rightArm, leftLeg, rightLeg, head };
}

export function animateHumanWalk(rig: HumanRig, phase: number, speedNorm: number): void {
  const amp = Math.min(1, speedNorm) * 0.65;
  const s = Math.sin(phase);
  rig.leftLeg.rotation.x = s * amp;
  rig.rightLeg.rotation.x = -s * amp;
  rig.leftArm.rotation.x = -s * amp * 0.8;
  rig.rightArm.rotation.x = s * amp * 0.8;
  rig.head.position.y = 1.54 + Math.abs(Math.cos(phase)) * 0.03 * speedNorm;
}
