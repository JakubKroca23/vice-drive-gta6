import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createCarbonFiberPBR } from './textures';
import { animateHumanWalk, createArticulatedHumanRig, createDetailedSupercarModel } from './models';
import type { InputState } from './types';
import { getGroundHeight } from './ocean';

export interface VehicleSystem {
  chassisBody: RAPIER.RigidBody;
  carGroup: THREE.Group;
  playerGroup: THREE.Group;
  controller: RAPIER.DynamicRayCastVehicleController;
  onFoot: boolean;
  boostCharge: number; // 0..100
  speedKmh: number;
  drifting: boolean;
  toggleOnFoot: () => void;
  toggleUnderglow: () => boolean;
  respawn: () => void;
  update: (
    dt: number,
    input: InputState,
    onWaterSplash: (x: number, z: number, strength: number) => void
  ) => void;
  getTargetPosition: () => THREE.Vector3;
  getHeadingRad: () => number;
}

export function createVehicleSystem(
  scene: THREE.Scene,
  world: RAPIER.World,
  isMobile: boolean
): VehicleSystem {
  // 1) Sculpted Vice Supercar Mesh (Beveled Extrusion + Carbon Aero + Alloy Rims)
  const carbonTex = createCarbonFiberPBR(128);
  const {
    group: carGroup,
    tailMat,
    underglowStrip: underStrip,
    underglowLight: underLight,
    flames,
    wheels: wheelMeshes
  } = createDetailedSupercarModel(carbonTex, isMobile);
  scene.add(carGroup);
  let underglowOn = true;

  // 2) Rapier3D RigidBody & DynamicRayCastVehicleController
  const startPos = { x: 0, y: 0.75, z: 42 };
  const startYaw = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
  carGroup.position.set(startPos.x, startPos.y, startPos.z);
  carGroup.quaternion.copy(startYaw);

  const chassisBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startPos.x, startPos.y, startPos.z)
      .setRotation({ x: startYaw.x, y: startYaw.y, z: startYaw.z, w: startYaw.w })
      .setLinearDamping(0.08)
      .setAngularDamping(0.45)
      .setCanSleep(false)
  );
  const chassisCol = RAPIER.ColliderDesc.cuboid(1.02, 0.36, 2.28)
    .setMass(1250)
    .setFriction(0.3)
    .setRestitution(0.15);
  chassisCol.centerOfMass = { x: 0, y: -0.25, z: 0.1 };
  world.createCollider(chassisCol, chassisBody);

  const controller = world.createVehicleController(chassisBody);
  controller.indexUpAxis = 1;
  controller.setIndexForwardAxis = 2;

  const wheelConfigs = [
    { x: -0.96, y: -0.05, z: 1.45, front: true },  // Front Left
    { x: 0.96, y: -0.05, z: 1.45, front: true },   // Front Right
    { x: -0.96, y: -0.05, z: -1.42, front: false }, // Rear Left
    { x: 0.96, y: -0.05, z: -1.42, front: false }   // Rear Right
  ];

  wheelConfigs.forEach((wc, idx) => {
    controller.addWheel(
      { x: wc.x, y: wc.y, z: wc.z },
      { x: 0, y: -1, z: 0 },
      { x: -1, y: 0, z: 0 },
      0.42, // suspension rest length
      0.38  // wheel radius
    );
    controller.setWheelSuspensionStiffness(idx, 38.0);
    controller.setWheelSuspensionCompression(idx, 4.4);
    controller.setWheelSuspensionRelaxation(idx, 5.2);
    controller.setWheelMaxSuspensionTravel(idx, 0.32);
    controller.setWheelMaxSuspensionForce(idx, 12000);
    controller.setWheelFrictionSlip(idx, wc.front ? 3.2 : 2.9);
    controller.setWheelSideFrictionStiffness(idx, wc.front ? 2.4 : 2.1);
  });

  // 3) Articulated 3D Player Rig (with shades & walking animation)
  const playerRig = createArticulatedHumanRig(0x00d9ff, 0x1e293b, 0xf1c29b, 0x231915);
  const playerGroup = playerRig.root;
  playerGroup.visible = false;
  scene.add(playerGroup);
  let walkPhase = 0;

  let onFoot = false;
  let playerHeading = 0;
  let boostCharge = 100;
  let speedKmh = 0;
  let drifting = false;
  let inWaterPrev = false;

  const tmpQuat = new THREE.Quaternion();
  const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  function respawn() {
    chassisBody.setTranslation({ x: 0, y: 1.0, z: 42 }, true);
    chassisBody.setRotation({ x: startYaw.x, y: startYaw.y, z: startYaw.z, w: startYaw.w }, true);
    chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    boostCharge = 100;
    onFoot = false;
    playerGroup.visible = false;
  }

  return {
    chassisBody,
    carGroup,
    playerGroup,
    controller,
    get onFoot() { return onFoot; },
    get boostCharge() { return boostCharge; },
    get speedKmh() { return speedKmh; },
    get drifting() { return drifting; },
    toggleOnFoot() {
      onFoot = !onFoot;
      if (onFoot) {
        const p = chassisBody.translation();
        playerGroup.position.set(p.x - 2.3, Math.max(0.15, p.y - 0.35), p.z);
        playerGroup.visible = true;
      } else {
        // Teleport back into car or bring car if far
        const p = chassisBody.translation();
        if (Math.hypot(playerGroup.position.x - p.x, playerGroup.position.z - p.z) > 12) {
          chassisBody.setTranslation({ x: playerGroup.position.x, y: playerGroup.position.y + 0.9, z: playerGroup.position.z }, true);
          chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
        playerGroup.visible = false;
      }
    },
    toggleUnderglow() {
      underglowOn = !underglowOn;
      underStrip.visible = underglowOn;
      underLight.visible = underglowOn;
      return underglowOn;
    },
    respawn,
    getTargetPosition() {
      return onFoot ? playerGroup.position : carGroup.position;
    },
    getHeadingRad() {
      if (onFoot) return playerHeading;
      tmpQuat.copy(carGroup.quaternion);
      tmpEuler.setFromQuaternion(tmpQuat, 'YXZ');
      return tmpEuler.y;
    },
    update(dt: number, input: InputState, onWaterSplash: (x: number, z: number, strength: number) => void) {
      const cPos = chassisBody.translation();
      const cRot = chassisBody.rotation();
      const cVel = chassisBody.linvel();
      const fwdSpeed = controller.currentVehicleSpeed();
      speedKmh = Math.round(Math.hypot(cVel.x, cVel.z) * 3.6);

      if (!onFoot) {
        const throttle = Math.abs(input.joyY) > 0.08 ? input.joyY : input.throttle;
        const rawSteer = Math.abs(input.joyX) > 0.08 ? -input.joyX : input.steer;

        // Speed-sensitive steering curve for crisp high-speed control
        const speedNorm = Math.min(1, Math.abs(fwdSpeed) / 36);
        const maxSteer = THREE.MathUtils.lerp(0.56, 0.24, speedNorm);
        const steerAngle = rawSteer * maxSteer;

        const useBoost = input.boost && boostCharge > 2 && throttle >= 0;
        if (useBoost) {
          boostCharge = Math.max(0, boostCharge - dt * 28);
        } else {
          boostCharge = Math.min(100, boostCharge + dt * 11);
        }

        const enginePower = useBoost ? 7800 : 4600;
        const driveForce = throttle > 0.02
          ? throttle * enginePower
          : throttle < -0.02
            ? (fwdSpeed > 2.5 ? 0 : throttle * 3200)
            : 0;

        const braking = (throttle < -0.05 && fwdSpeed > 2.5) || input.handbrake;
        tailMat.emissiveIntensity = braking ? 6.5 : 2.0;

        // Rear-wheel drive + Handbrake Drift physics
        controller.setWheelSteering(0, steerAngle);
        controller.setWheelSteering(1, steerAngle);
        controller.setWheelEngineForce(2, driveForce);
        controller.setWheelEngineForce(3, driveForce);
        controller.setWheelEngineForce(0, useBoost ? driveForce * 0.45 : 0);
        controller.setWheelEngineForce(1, useBoost ? driveForce * 0.45 : 0);

        const brakeForce = input.handbrake ? 140 : (throttle < -0.05 && fwdSpeed > 2.5 ? 110 : 0);
        controller.setWheelBrake(0, input.handbrake ? 0 : brakeForce);
        controller.setWheelBrake(1, input.handbrake ? 0 : brakeForce);
        controller.setWheelBrake(2, brakeForce);
        controller.setWheelBrake(3, brakeForce);

        // Drift side-friction modulation
        const rearSideFric = input.handbrake ? 0.55 : 2.15;
        controller.setWheelSideFrictionStiffness(2, rearSideFric);
        controller.setWheelSideFrictionStiffness(3, rearSideFric);
        drifting = input.handbrake && Math.abs(fwdSpeed) > 6;

        // Nitro boost impulse along car forward vector
        if (useBoost && (controller.wheelIsInContact(2) || controller.wheelIsInContact(3))) {
          const fwdVec = new THREE.Vector3(0, 0, 1).applyQuaternion(
            new THREE.Quaternion(cRot.x, cRot.y, cRot.z, cRot.w)
          );
          chassisBody.applyImpulse(
            { x: fwdVec.x * 16500 * dt, y: 0, z: fwdVec.z * 16500 * dt },
            true
          );
        }
        flames.forEach((f) => {
          f.visible = useBoost;
          if (useBoost) f.scale.set(1, 1, 0.75 + Math.random() * 0.55);
        });

        // Subtle aerodynamic downforce at high speed
        if (Math.abs(fwdSpeed) > 15) {
          chassisBody.applyImpulse({ x: 0, y: -Math.abs(fwdSpeed) * 180 * dt, z: 0 }, true);
        }

        // Auto upright assist if flipped upside down
        const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(
          new THREE.Quaternion(cRot.x, cRot.y, cRot.z, cRot.w)
        );
        if (upVec.y < 0.15 && Math.abs(fwdSpeed) < 2) {
          chassisBody.applyTorqueImpulse({ x: 0, y: 0, z: 4200 * dt }, true);
        }
      } else {
        // Park car gently when on foot
        controller.setWheelEngineForce(2, 0);
        controller.setWheelEngineForce(3, 0);
        controller.setWheelBrake(2, 60);
        controller.setWheelBrake(3, 60);
        flames.forEach((f) => { f.visible = false; });

        const moveX = Math.abs(input.joyX) > 0.08 ? input.joyX : -input.steer;
        const moveZ = Math.abs(input.joyY) > 0.08 ? input.joyY : input.throttle;
        const len = Math.hypot(moveX, moveZ);
        if (len > 0.05) {
          const walkSpeed = input.boost ? 9.5 : 5.2;
          const nx = moveX / Math.max(1, len);
          const nz = moveZ / Math.max(1, len);
          playerHeading = Math.atan2(nx, nz);
          playerGroup.position.x += nx * walkSpeed * dt;
          playerGroup.position.z += nz * walkSpeed * dt;
          playerGroup.rotation.y = playerHeading;
          walkPhase += dt * walkSpeed * 2.1;
          animateHumanWalk(playerRig, walkPhase, input.boost ? 1.0 : 0.75);
        } else {
          animateHumanWalk(playerRig, 0, 0);
        }
        const gY = Math.max(0.05, getGroundHeight(playerGroup.position.x, playerGroup.position.z));
        playerGroup.position.y = gY;
      }

      // Ocean splash & buoyancy if car drives into the ocean
      const inOcean = cPos.x > 34 && cPos.y < 0.35;
      if (inOcean) {
        const sub = Math.min(1, (0.2 - cPos.y) / 1.2);
        if (sub > 0) {
          chassisBody.applyImpulse({ x: 0, y: sub * 18500 * dt, z: 0 }, true);
          chassisBody.setLinvel({ x: cVel.x * 0.94, y: cVel.y * 0.9, z: cVel.z * 0.94 }, true);
        }
        if (!inWaterPrev) {
          inWaterPrev = true;
          onWaterSplash(cPos.x, cPos.z, Math.min(2.2, Math.hypot(cVel.x, cVel.z) * 0.12));
        }
      } else {
        inWaterPrev = false;
      }

      controller.updateVehicle(dt);

      // Sync Three.js car & wheels
      carGroup.position.set(cPos.x, cPos.y, cPos.z);
      carGroup.quaternion.set(cRot.x, cRot.y, cRot.z, cRot.w);

      wheelMeshes.forEach((wm, i) => {
        const wc = wheelConfigs[i];
        const suspLen = controller.wheelSuspensionLength(i) ?? 0.35;
        const rotAng = controller.wheelRotation(i) ?? 0;
        const steer = controller.wheelSteering(i) ?? 0;
        wm.position.set(wc.x, wc.y - suspLen, wc.z);
        wm.rotation.order = 'YXZ';
        wm.rotation.y = steer;
        wm.rotation.x = rotAng;
      });
    }
  };
}
