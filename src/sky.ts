import * as THREE from 'three';
import type { TimeOfDayKey, TimeOfDayPreset } from './types';

export const TOD_PRESETS: Record<TimeOfDayKey, TimeOfDayPreset> = {
  sunset: {
    label: 'Vice Západ',
    elevation: 7.5,
    azimuth: 78,
    clouds: 0.44,
    exposure: 1.08,
    neonStrength: 1.65
  },
  night: {
    label: 'Neon Noc',
    elevation: -9.0,
    azimuth: 65,
    clouds: 0.28,
    exposure: 1.24,
    neonStrength: 3.1
  },
  noon: {
    label: 'Miami Poledne',
    elevation: 54.0,
    azimuth: 135,
    clouds: 0.34,
    exposure: 0.94,
    neonStrength: 0.35
  }
};

export interface SkySystem {
  sunDir: THREE.Vector3;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  uniforms: {
    uSunDir: { value: THREE.Vector3 };
    uTime: { value: number };
    uCloudCover: { value: number };
  };
  applyPreset: (key: TimeOfDayKey) => TimeOfDayPreset;
  setSunAngles: (elevationDeg: number, azimuthDeg: number, cloudCover: number, rebuildIBL?: boolean) => void;
  update: (elapsed: number) => void;
}

export function createSkySystem(scene: THREE.Scene, renderer: THREE.WebGLRenderer): SkySystem {
  const sunDir = new THREE.Vector3(0.88, 0.14, 0.45).normalize();
  const uniforms = {
    uSunDir: { value: sunDir.clone() },
    uTime: { value: 0 },
    uCloudCover: { value: 0.44 }
  };

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir;
      uniform float uTime;
      uniform float uCloudCover;
      varying vec3 vDir;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = r * p * 2.04;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 rd = normalize(vDir);
        vec3 sun = normalize(uSunDir);
        float sunY = sun.y;
        float cosTheta = max(dot(rd, sun), 0.0);

        float dayW = smoothstep(-0.06, 0.28, sunY);
        float sunsetW = smoothstep(-0.12, 0.05, sunY) * (1.0 - smoothstep(0.08, 0.36, sunY));
        float nightW = 1.0 - smoothstep(-0.14, 0.05, sunY);

        // Leonida / Miami Vice Palette
        vec3 dayZenith = vec3(0.07, 0.28, 0.68);
        vec3 dayHorizon = vec3(0.55, 0.78, 0.96);

        vec3 sunsetZenith = vec3(0.11, 0.09, 0.30);
        vec3 sunsetHorizon = vec3(1.45, 0.42, 0.52); // Warm Miami magenta-coral-gold

        vec3 nightZenith = vec3(0.012, 0.016, 0.042);
        vec3 nightHorizon = vec3(0.08, 0.035, 0.14); // Subtle neon city skyglow

        vec3 zenith = mix(mix(sunsetZenith, dayZenith, dayW), nightZenith, nightW);
        vec3 horizon = mix(mix(sunsetHorizon, dayHorizon, dayW), nightHorizon, nightW);

        float curve = pow(1.0 - clamp(rd.y, 0.0, 1.0), 3.4);
        vec3 sky = mix(zenith, horizon, curve);

        // Solar Mie glow + disc
        float mie = pow(cosTheta, 7.0) * 0.48 + pow(cosTheta, 56.0) * 1.45;
        vec3 sunCol = mix(vec3(1.85, 0.65, 0.24), vec3(1.45, 1.32, 1.12), smoothstep(0.02, 0.32, sunY));
        sky += sunCol * mie * smoothstep(-0.12, 0.14, sunY);

        float disc = smoothstep(0.9993, 0.99975, dot(rd, sun));
        sky += sunCol * 20.0 * disc * smoothstep(-0.04, 0.06, sunY);

        // Stars at night
        if (nightW > 0.02 && rd.y > 0.02) {
          vec2 suv = rd.xz / (rd.y + 0.2) * 88.0;
          float rnd = hash(floor(suv));
          if (rnd > 0.965) {
            float d = length(fract(suv) - 0.5);
            float tw = 0.7 + 0.3 * sin(uTime * 3.0 + rnd * 50.0);
            sky += vec3(0.9, 0.95, 1.0) * smoothstep(0.16, 0.02, d) * tw * (rnd - 0.965) * 26.0 * nightW;
          }
        }

        // Lit tropical cumulus clouds
        if (rd.y > 0.01 && uCloudCover > 0.01) {
          vec2 cuv = rd.xz / (rd.y + 0.15) * 1.25 + vec2(uTime * 0.01, uTime * 0.005);
          float c = fbm(cuv);
          float dens = smoothstep(1.0 - uCloudCover * 0.75, 1.02 - uCloudCover * 0.2, c);
          float fade = smoothstep(0.01, 0.16, rd.y);
          float lit = clamp(0.4 + 0.6 * (c - fbm(cuv + sun.xz * 0.14)) * 2.5 + pow(cosTheta, 8.0) * 0.55, 0.2, 1.2);
          vec3 cCol = mix(vec3(0.08, 0.07, 0.15), sunCol * 1.35, lit * smoothstep(-0.1, 0.22, sunY));
          cCol = mix(cCol, vec3(0.88, 0.92, 0.98), dayW * 0.75);
          sky = mix(sky, cCol, dens * fade * 0.88);
        }

        if (rd.y < 0.0) {
          sky = mix(horizon * 0.55, vec3(0.02, 0.03, 0.05), clamp(-rd.y * 4.0, 0.0, 1.0));
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `
  });

  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(320, 40, 24), skyMat);
  scene.add(skyMesh);

  const sunLight = new THREE.DirectionalLight(0xffcf9e, 3.2);
  sunLight.castShadow = true;
  const isMobile = window.innerWidth <= 820;
  const shadowSize = isMobile ? 1024 : 2048;
  sunLight.shadow.mapSize.set(shadowSize, shadowSize);
  sunLight.shadow.camera.near = 2;
  sunLight.shadow.camera.far = 160;
  const sc = 46;
  sunLight.shadow.camera.left = -sc;
  sunLight.shadow.camera.right = sc;
  sunLight.shadow.camera.top = sc;
  sunLight.shadow.camera.bottom = -sc;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemiLight = new THREE.HemisphereLight(0x88b4f0, 0x241d2e, 0.6);
  scene.add(hemiLight);

  // Real-time PMREM HDR IBL
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), skyMat));
  let envRT: THREE.WebGLRenderTarget | null = null;
  let iblTimer: number | null = null;

  function rebuildEnv() {
    const next = pmrem.fromScene(envScene, 0.02);
    if (envRT) envRT.dispose();
    envRT = next;
    scene.environment = envRT.texture;
    scene.environmentIntensity = 1.15;
  }

  function setSunAngles(elevationDeg: number, azimuthDeg: number, cloudCover: number, rebuildIBL = true) {
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    sunDir.setFromSphericalCoords(1, phi, theta).normalize();
    uniforms.uSunDir.value.copy(sunDir);
    uniforms.uCloudCover.value = cloudCover;

    const dayW = THREE.MathUtils.smoothstep(elevationDeg, -2, 30);
    const sunsetW = THREE.MathUtils.smoothstep(elevationDeg, -5, 4) * (1 - THREE.MathUtils.smoothstep(elevationDeg, 10, 32));

    sunLight.color.setRGB(
      THREE.MathUtils.lerp(0.32, 1.0, Math.max(dayW, sunsetW)),
      THREE.MathUtils.lerp(0.42, 0.94, dayW) * (1 - sunsetW * 0.35) + sunsetW * 0.42,
      THREE.MathUtils.lerp(0.75, 0.88, dayW) * (1 - sunsetW * 0.55)
    );
    sunLight.intensity = Math.max(0.55, THREE.MathUtils.lerp(0.65, 3.8, dayW) + sunsetW * 1.2);

    const lightDir = elevationDeg < -2 ? sunDir.clone().setY(Math.abs(sunDir.y) + 0.3).normalize() : sunDir;
    sunLight.position.copy(lightDir).multiplyScalar(72);

    hemiLight.intensity = 0.32 + dayW * 0.55;
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.setRGB(
        THREE.MathUtils.lerp(0.05, 0.45, dayW) + sunsetW * 0.35,
        THREE.MathUtils.lerp(0.04, 0.58, dayW) + sunsetW * 0.14,
        THREE.MathUtils.lerp(0.11, 0.74, dayW) + sunsetW * 0.22
      );
    }

    if (rebuildIBL) {
      rebuildEnv();
    } else {
      if (iblTimer) window.clearTimeout(iblTimer);
      iblTimer = window.setTimeout(rebuildEnv, 70);
    }
  }

  function applyPreset(key: TimeOfDayKey): TimeOfDayPreset {
    const p = TOD_PRESETS[key];
    setSunAngles(p.elevation, p.azimuth, p.clouds, true);
    return p;
  }

  return {
    sunDir,
    sunLight,
    hemiLight,
    uniforms,
    applyPreset,
    setSunAngles,
    update(elapsed: number) {
      uniforms.uTime.value = elapsed;
    }
  };
}
