import * as THREE from 'three';
import { animateHumanWalk, createArticulatedHumanRig, type HumanRig } from './models';
import { getGroundHeight } from './ocean';

interface PedestrianAgent {
  rig: HumanRig;
  x: number;
  baseX: number;
  z: number;
  dirZ: 1 | -1;
  speed: number;
  phase: number;
  dodgeX: number;
}

export interface PedestrianSystem {
  update: (dt: number, carPos: THREE.Vector3, carSpeedMs: number) => void;
}

export function createPedestrianSystem(scene: THREE.Scene): PedestrianSystem {
  const agents: PedestrianAgent[] = [];

  const shirtPalette = [0xff4f9a, 0x00e5ff, 0xffc857, 0xffffff, 0x70e0a8, 0xb87cff, 0xff784f];
  const pantsPalette = [0x1f2838, 0xd8c8a8, 0x2f486d, 0xf2f4f8, 0x262930];
  const skinPalette = [0xf2c5a0, 0xd89c72, 0x9b6442, 0xefc09e];
  const hairPalette = [0x1c1512, 0x4a3121, 0xd8a84e, 0x222228];

  const lanes = [-17.2, -16.0, 16.0, 17.3, 23.0];

  for (let i = 0; i < 14; i++) {
    const laneX = lanes[i % lanes.length];
    const z = -95 + i * 14.5;
    const dirZ: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const rig = createArticulatedHumanRig(
      shirtPalette[i % shirtPalette.length],
      pantsPalette[(i * 2) % pantsPalette.length],
      skinPalette[i % skinPalette.length],
      hairPalette[(i * 3) % hairPalette.length]
    );
    const y = laneX > 18 ? getGroundHeight(laneX, z) : 0.22;
    rig.root.position.set(laneX, y, z);
    rig.root.rotation.y = dirZ === 1 ? 0 : Math.PI;
    scene.add(rig.root);

    agents.push({
      rig,
      x: laneX,
      baseX: laneX,
      z,
      dirZ,
      speed: 1.35 + (i % 4) * 0.25,
      phase: i * 0.9,
      dodgeX: 0
    });
  }

  return {
    update(dt: number, carPos: THREE.Vector3, carSpeedMs: number) {
      for (const a of agents) {
        a.z += a.dirZ * a.speed * dt;
        if (a.z > 130) a.z = -130;
        if (a.z < -130) a.z = 130;

        // Reactive dodge when car approaches fast
        const dx = a.x - carPos.x;
        const dz = a.z - carPos.z;
        const dist = Math.hypot(dx, dz);
        let speedMult = 1.0;
        if (dist < 4.5 && carSpeedMs > 5) {
          const away = dx >= 0 ? 1 : -1;
          a.dodgeX = THREE.MathUtils.lerp(a.dodgeX, away * 2.2, dt * 8);
          speedMult = 2.0;
        } else {
          a.dodgeX = THREE.MathUtils.lerp(a.dodgeX, 0, dt * 2.5);
        }

        a.x = a.baseX + a.dodgeX;
        const y = a.x > 18 ? getGroundHeight(a.x, a.z) : 0.22;

        a.phase += dt * a.speed * speedMult * 4.4;
        animateHumanWalk(a.rig, a.phase, speedMult);

        a.rig.root.position.set(a.x, y, a.z);
        a.rig.root.rotation.y = a.dirZ === 1 ? 0 : Math.PI;
      }
    }
  };
}
