import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { StaticBoxDef } from './city';
import { createTrafficCarModel } from './models';
import { getGroundHeight } from './ocean';
import type { DynamicProp, TrafficCarData } from './types';

export interface StuntRampDef {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  rotX: number;
}

export interface PhysicsWorldSystem {
  RAPIER: typeof RAPIER;
  world: RAPIER.World;
  props: DynamicProp[];
  trafficCars: TrafficCarData[];
  step: (dt: number, onWaterSplash: (x: number, z: number, strength: number) => void) => void;
  resetProps: () => void;
  bodyCount: () => number;
}

export async function createPhysicsWorld(
  scene: THREE.Scene,
  staticBoxes: StaticBoxDef[],
  stuntRamps: StuntRampDef[]
): Promise<PhysicsWorldSystem> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // 1) Static City, Road, Sidewalks, Bridge & Buildings
  staticBoxes.forEach((b) => {
    const desc = RAPIER.ColliderDesc.cuboid(b.w * 0.5, b.h * 0.5, b.d * 0.5)
      .setTranslation(b.x, b.y, b.z)
      .setFriction(0.85)
      .setRestitution(0.15);
    if (b.rotZ) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, b.rotZ));
      desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    world.createCollider(desc);
  });

  // 2) Stunt Ramps
  stuntRamps.forEach((r) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.rotX, 0, 0));
    const desc = RAPIER.ColliderDesc.cuboid(r.w * 0.5, r.h * 0.5, r.d * 0.5)
      .setTranslation(r.x, r.y, r.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(0.95);
    world.createCollider(desc);
  });

  // 3) Beach & Ocean Bed Trimesh Collider (100% aligned with getGroundHeight)
  const bGeo = new THREE.PlaneGeometry(46, 320, 24, 48);
  bGeo.rotateX(-Math.PI / 2);
  bGeo.translate(39, 0, 0);
  const bPos = bGeo.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    bPos.setY(i, getGroundHeight(bPos.getX(i), bPos.getZ(i)));
  }
  const verts = new Float32Array(bPos.array);
  const idxArr = bGeo.index ? new Uint32Array(bGeo.index.array) : new Uint32Array(0);
  world.createCollider(RAPIER.ColliderDesc.trimesh(verts, idxArr).setFriction(0.75));
  bGeo.dispose();

  // Ocean floor safety slab beyond x > 54
  world.createCollider(RAPIER.ColliderDesc.cuboid(140, 0.5, 260).setTranslation(190, -5.9, 0));

  // 4) Destructible Street Props (Cones, Crates, Barrels, Beach Balls)
  const props: DynamicProp[] = [];
  const coneGeo = new THREE.ConeGeometry(0.28, 0.72, 10);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xff3b00, emissiveIntensity: 0.35, roughness: 0.45 });

  const crateGeo = new THREE.BoxGeometry(0.85, 0.85, 0.85);
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xb57a46, roughness: 0.78 });

  const barrelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.95, 12);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x0099cc, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.25 });

  const ballGeo = new THREE.SphereGeometry(0.48, 16, 12);
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xff2e93, roughness: 0.25, metalness: 0.1 });

  interface PropInit {
    kind: DynamicProp['kind'];
    x: number;
    y: number;
    z: number;
  }
  const initialPropSpecs: PropInit[] = [];
  for (let z = -110; z <= 110; z += 18) {
    if (Math.abs(z) < 12) continue;
    initialPropSpecs.push({ kind: 'cone', x: -12.6, y: 0.55, z });
    initialPropSpecs.push({ kind: 'cone', x: 12.8, y: 0.55, z: z + 6 });
  }
  // Crates & neon barrels near pier/ramps & island
  for (let i = 0; i < 10; i++) {
    initialPropSpecs.push({ kind: 'barrel', x: 14.5, y: 0.7, z: -26 + i * 5.2 });
    initialPropSpecs.push({ kind: 'crate', x: 122 + (i % 3) * 2.2, y: 0.8 + Math.floor(i / 3) * 0.9, z: -10 + (i % 2) * 3 });
  }
  // Beach balls along golden sand
  for (let i = 0; i < 8; i++) {
    const bx = 26 + (i % 3) * 2.5;
    const bz = -95 + i * 25;
    initialPropSpecs.push({ kind: 'ball', x: bx, y: getGroundHeight(bx, bz) + 0.6, z: bz });
  }

  function spawnProps() {
    while (props.length > 0) {
      const p = props.pop()!;
      scene.remove(p.mesh);
      const rb = world.getRigidBody(p.bodyHandle);
      if (rb) world.removeRigidBody(rb);
    }

    initialPropSpecs.forEach((s) => {
      let mesh: THREE.Mesh;
      let collider: RAPIER.ColliderDesc;
      let radius = 0.45;

      if (s.kind === 'cone') {
        mesh = new THREE.Mesh(coneGeo, coneMat);
        collider = RAPIER.ColliderDesc.cone(0.36, 0.28).setDensity(0.5);
        radius = 0.35;
      } else if (s.kind === 'crate') {
        mesh = new THREE.Mesh(crateGeo, crateMat);
        collider = RAPIER.ColliderDesc.cuboid(0.425, 0.425, 0.425).setDensity(0.45);
        radius = 0.45;
      } else if (s.kind === 'barrel') {
        mesh = new THREE.Mesh(barrelGeo, barrelMat);
        collider = RAPIER.ColliderDesc.cylinder(0.475, 0.36).setDensity(0.7);
        radius = 0.45;
      } else {
        mesh = new THREE.Mesh(ballGeo, ballMat);
        collider = RAPIER.ColliderDesc.ball(0.48).setDensity(0.18).setRestitution(0.75);
        radius = 0.48;
      }

      mesh.castShadow = true;
      mesh.position.set(s.x, s.y, s.z);
      scene.add(mesh);

      const rb = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(s.x, s.y, s.z)
          .setLinearDamping(0.3)
          .setAngularDamping(0.4)
      );
      world.createCollider(collider, rb);

      props.push({
        mesh,
        bodyHandle: rb.handle,
        kind: s.kind,
        inWater: false,
        radius
      });
    });
  }
  spawnProps();

  // 5) Autonomous Cruising Traffic Cars along Ocean Drive (Sculpted Models)
  const trafficCars: TrafficCarData[] = [];
  const trafficSpecs: Array<{
    laneX: number;
    dirZ: 1 | -1;
    z: number;
    color: number;
    speed: number;
    style: 'coupe' | 'suv' | 'convertible';
  }> = [
    { laneX: -5.2, dirZ: 1, z: -70, color: 0xffd43b, speed: 13.5, style: 'convertible' },
    { laneX: 5.2, dirZ: -1, z: 45, color: 0x20c997, speed: 15.0, style: 'coupe' },
    { laneX: 9.8, dirZ: -1, z: -40, color: 0x4dabf7, speed: 12.0, style: 'suv' }
  ];

  trafficSpecs.forEach((tc) => {
    const grp = createTrafficCarModel(tc.color, tc.style, tc.dirZ);
    grp.position.set(tc.laneX, 0.10, tc.z);
    scene.add(grp);

    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(tc.laneX, 0.12, tc.z)
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.0, 0.7, 2.15).setTranslation(0, 0.7, 0), rb);

    trafficCars.push({
      mesh: grp,
      bodyHandle: rb.handle,
      laneX: tc.laneX,
      dirZ: tc.dirZ,
      speed: tc.speed,
      z: tc.z
    });
  });

  return {
    RAPIER,
    world,
    props,
    trafficCars,
    resetProps: spawnProps,
    bodyCount: () => world.bodies.len(),
    step(dt: number, onWaterSplash: (x: number, z: number, strength: number) => void) {
      // Advance NPC traffic cars
      trafficCars.forEach((tc) => {
        tc.z += tc.dirZ * tc.speed * dt;
        if (tc.z > 145) tc.z = -145;
        if (tc.z < -145) tc.z = 145;
        const rb = world.getRigidBody(tc.bodyHandle);
        if (rb) {
          rb.setNextKinematicTranslation({ x: tc.laneX, y: 0.12, z: tc.z });
        }
        tc.mesh.position.set(tc.laneX, 0.12, tc.z);
      });

      // Buoyancy for props that fly into the ocean
      props.forEach((p) => {
        const rb = world.getRigidBody(p.bodyHandle);
        if (!rb) return;
        const t = rb.translation();
        if (t.x > 33 && t.y < p.radius) {
          const sub = Math.min(1, (0 - (t.y - p.radius)) / (p.radius * 2));
          if (sub > 0) {
            rb.applyImpulse({ x: 0, y: sub * 14.5 * rb.mass() * dt, z: 0 }, true);
            const v = rb.linvel();
            rb.setLinvel({ x: v.x * 0.96, y: v.y * 0.92, z: v.z * 0.96 }, true);
            if (!p.inWater) {
              p.inWater = true;
              if (Math.abs(v.y) + Math.hypot(v.x, v.z) > 2.5) {
                onWaterSplash(t.x, t.z, 1.1);
              }
            }
          }
        } else {
          p.inWater = false;
        }
      });

      world.timestep = Math.min(dt, 1 / 45);
      world.step();

      // Sync dynamic props to Three.js meshes
      props.forEach((p) => {
        const rb = world.getRigidBody(p.bodyHandle);
        if (!rb || rb.isSleeping()) return;
        const t = rb.translation();
        const r = rb.rotation();
        p.mesh.position.set(t.x, t.y, t.z);
        p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      });
    }
  };
}
