import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSkySystem } from './sky';
import { createOceanSystem } from './ocean';
import { buildViceCity } from './city';
import { createPhysicsWorld, type StuntRampDef } from './physics';
import { createVehicleSystem } from './vehicle';
import { createPedestrianSystem } from './pedestrians';
import { createPostProcessing } from './postprocessing';
import { ViceAudioEngine } from './audio';
import { createUISystem } from './ui';
import type { InputState, TimeOfDayKey } from './types';

async function bootstrap() {
  const loaderEl = document.getElementById('loader')!;
  const loaderBar = document.getElementById('loader-bar')!;
  const setProgress = (p: number) => { loaderBar.style.width = `${p}%`; };
  setProgress(15);

  const isMobile = window.innerWidth <= 820 || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  document.body.classList.toggle('is-touch', isMobile);

  const container = document.getElementById('canvas-container')!;
  const renderer = new THREE.WebGLRenderer({
    antialias: !isMobile,
    powerPreference: 'high-performance',
    stencil: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.45 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1f142a, 0.0042);

  const isPortrait = window.innerHeight > window.innerWidth;
  const camera = new THREE.PerspectiveCamera(isPortrait ? 65 : 56, window.innerWidth / window.innerHeight, 0.2, 480);
  camera.position.set(isPortrait ? 3.2 : 2.8, isPortrait ? 3.9 : 3.3, isPortrait ? 52.5 : 50.5);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 1.6, 42);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.07;
  orbit.enablePan = false;
  orbit.minDistance = 4.5;
  orbit.maxDistance = 26;
  orbit.maxPolarAngle = Math.PI * 0.47;

  setProgress(35);
  const sky = createSkySystem(scene, renderer);
  const ocean = createOceanSystem(scene, sky.sunDir, isMobile);
  const city = buildViceCity(scene);
  setProgress(58);

  const stuntRamps = (scene.userData.stuntRamps || []) as StuntRampDef[];
  const physics = await createPhysicsWorld(scene, city.staticBoxes, stuntRamps);
  setProgress(82);

  const vehicle = createVehicleSystem(scene, physics.world, isMobile);
  const pedestrians = createPedestrianSystem(scene);
  const post = createPostProcessing(renderer, scene, camera, isMobile);
  const audio = new ViceAudioEngine();

  const applyTimePreset = (key: TimeOfDayKey) => {
    const p = sky.applyPreset(key);
    city.setNeonIntensity(p.neonStrength);
    post.setExposure(p.exposure);
  };
  applyTimePreset('sunset');

  const input: InputState = {
    throttle: 0,
    steer: 0,
    handbrake: false,
    boost: false,
    joyX: 0,
    joyY: 0
  };

  const ui = createUISystem(
    {
      onPreset: applyTimePreset,
      onToggleAudio: () => {
        const next = !audio.isEnabled();
        audio.setEnabled(next);
        return next;
      },
      onToggleOnFoot: () => vehicle.toggleOnFoot(),
      onToggleUnderglow: () => vehicle.toggleUnderglow(),
      onTogglePlanar: (on) => ocean.setPlanarEnabled(on),
      onToggleBloom: (on) => post.setBloomEnabled(on),
      onToggleShadows: (on) => {
        renderer.shadowMap.enabled = on;
        sky.sunLight.castShadow = on;
      },
      onRespawnCar: () => vehicle.respawn(),
      onResetProps: () => physics.resetProps(),
      onUnlockAudio: () => audio.unlock()
    },
    isMobile
  );
  ui.bindTouchInput(input);

  // Keyboard Controls
  const keys = new Set<string>();
  const syncKeys = () => {
    const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const turn = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
    input.throttle = fwd;
    input.steer = turn;
    input.handbrake = keys.has('Space');
    input.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
  };

  window.addEventListener('keydown', (e) => {
    audio.unlock();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    keys.add(e.code);
    syncKeys();
    if (e.code === 'KeyE') vehicle.toggleOnFoot();
    if (e.code === 'KeyR') vehicle.respawn();
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    syncKeys();
  });
  renderer.domElement.addEventListener('pointerdown', () => audio.unlock());

  // Track user camera orbit drag so auto-follow gently yields while user looks around
  let userOrbiting = false;
  let lastOrbitInteraction = -10;
  orbit.addEventListener('start', () => { userOrbiting = true; });
  orbit.addEventListener('end', () => {
    userOrbiting = false;
    lastOrbitInteraction = performance.now() * 0.001;
  });

  setProgress(100);
  window.setTimeout(() => loaderEl.classList.add('hidden'), 260);

  // Populate minimap & HUD immediately on frame 0
  const initTarget = vehicle.getTargetPosition();
  ui.update(
    {
      fps: 60,
      speedKmh: 0,
      gear: 'GN',
      boostPct: 100,
      onFoot: false,
      posX: initTarget.x,
      posZ: initTarget.z,
      headingRad: vehicle.getHeadingRad(),
      bodiesCount: physics.bodyCount()
    },
    physics.trafficCars
  );

  const clock = new THREE.Clock();
  const desiredCamPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const prevTarget = new THREE.Vector3().copy(vehicle.getTargetPosition());
  let frames = 0;
  let fpsAcc = 0;
  let fpsVal = 60;

  const onSplash = (x: number, z: number, strength: number) => {
    ocean.triggerRipple(x, z, strength);
    audio.playSplash();
  };

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();

    camera.getWorldDirection(camDir);
    vehicle.update(dt, input, camDir, onSplash);
    pedestrians.update(dt, vehicle.carGroup.position, vehicle.speedKmh / 3.6);
    physics.step(dt, onSplash);
    audio.updateVehicle(vehicle.speedKmh / 3.6, input.throttle, input.boost, vehicle.drifting, !vehicle.onFoot);

    // Smooth GTA Chase Camera
    const target = vehicle.getTargetPosition();
    const deltaMove = new THREE.Vector3().subVectors(target, prevTarget);
    prevTarget.copy(target);

    camera.position.add(deltaMove);
    orbit.target.set(target.x, target.y + (vehicle.onFoot ? 1.2 : 1.05), target.z);

    const nowSec = performance.now() * 0.001;
    if (!userOrbiting && (nowSec - lastOrbitInteraction > 1.6) && !vehicle.onFoot && vehicle.speedKmh > 6) {
      // Gently swing behind the car's heading
      const heading = vehicle.getHeadingRad();
      const dist = isPortrait ? 10.2 : 8.6;
      const height = isPortrait ? 3.8 : 3.2;
      desiredCamPos.set(
        target.x - Math.sin(heading) * dist,
        Math.max(1.2, target.y + height),
        target.z - Math.cos(heading) * dist
      );
      camera.position.lerp(desiredCamPos, Math.min(1, dt * 3.8));
    }
    orbit.update();

    // Update sky, shadow follow, ocean reflection & HDR post-processing
    sky.update(elapsed);
    sky.sunLight.target.position.set(target.x, 0, target.z);
    sky.sunLight.position.copy(sky.sunDir).multiplyScalar(75).add(new THREE.Vector3(target.x, 0, target.z));

    ocean.update(elapsed, sky.sunDir, sky.sunLight.color);
    ocean.renderReflection(renderer, scene, camera);
    post.render(elapsed);

    frames++;
    fpsAcc += dt;
    if (fpsAcc >= 0.35) {
      fpsVal = Math.round(frames / fpsAcc);
      frames = 0;
      fpsAcc = 0;
      const gearNum = vehicle.speedKmh < 2 ? 'N' : Math.min(6, Math.floor(vehicle.speedKmh / 26) + 1).toString();
      ui.update(
        {
          fps: fpsVal,
          speedKmh: vehicle.speedKmh,
          gear: `G${gearNum}`,
          boostPct: vehicle.boostCharge,
          onFoot: vehicle.onFoot,
          posX: target.x,
          posZ: target.z,
          headingRad: vehicle.getHeadingRad(),
          bodiesCount: physics.bodyCount()
        },
        physics.trafficCars
      );
    }
  }

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.fov = h > w ? 65 : 56;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    post.resize(w, h);
    ocean.resize(w, h);
  });

  animate();
}

bootstrap();
