import * as THREE from 'three';

export function getGroundHeight(x: number, z: number): number {
  // Starfish Island plaza on the East side of the bridge (x in [104..152], z in [-28..28])
  const islandDx = Math.max(0, Math.abs(x - 128) - 22);
  const islandDz = Math.max(0, Math.abs(z) - 24);
  const islandDist = Math.hypot(islandDx, islandDz);
  if (islandDist < 10) {
    const t = 1 - Math.min(1, islandDist / 10);
    return -5.2 * (1 - t * t) + 0.25 * (t * t);
  }

  // City & Ocean Drive flat zone (x <= 18)
  if (x <= 18) {
    return 0.0;
  }

  // Sloped golden beach (x from 18 -> 38 crosses y = 0 at x ~ 35, then dips to -5.5 ocean bed)
  if (x < 52) {
    const t = (x - 18) / 34; // 0..1
    return 0.24 * (1 - t) - 5.6 * Math.pow(t, 1.55);
  }

  return -5.4;
}

export interface OceanSystem {
  mesh: THREE.Mesh;
  triggerRipple: (x: number, z: number, strength?: number) => void;
  update: (elapsed: number, sunDir: THREE.Vector3, sunCol: THREE.Color) => void;
  renderReflection: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void;
  resize: (w: number, h: number) => void;
  setPlanarEnabled: (enabled: boolean) => void;
}

export function createOceanSystem(scene: THREE.Scene, sunDirRef: THREE.Vector3, isMobile: boolean): OceanSystem {
  const scale = isMobile ? 0.34 : 0.46;
  const reflectRT = new THREE.WebGLRenderTarget(
    Math.floor(window.innerWidth * scale),
    Math.floor(window.innerHeight * scale),
    { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
  );
  const reflectCam = new THREE.PerspectiveCamera();
  const reflectMatrix = new THREE.Matrix4();
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.02);

  const MAX_RIPPLES = 12;
  const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -999, 0));
  let rippleIdx = 0;
  let lastElapsed = 0;

  // Ocean covers Eastward from x = 26 to 340, z = -260 to 260
  const geo = new THREE.PlaneGeometry(320, 520, 128, 160);
  geo.rotateX(-Math.PI / 2);
  geo.translate(186, 0, 0);

  const pos = geo.attributes.position;
  const depths = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    depths[i] = Math.max(0.0, 0.0 - getGroundHeight(x, z));
  }
  geo.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));

  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: sunDirRef },
    uSunColor: { value: new THREE.Color(1.4, 0.85, 0.55) },
    uReflectMap: { value: reflectRT.texture },
    uReflectMatrix: { value: reflectMatrix },
    uUsePlanar: { value: 1.0 },
    uRipples: { value: ripples }
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    vertexShader: /* glsl */`
      attribute float aDepth;
      uniform float uTime;
      uniform mat4 uReflectMatrix;
      varying vec3 vWorldPos;
      varying float vDepth;
      varying vec4 vReflectProj;

      vec3 gerstner(vec2 p, vec2 dir, float steep, float wl, float t) {
        float k = 6.2831853 / wl;
        float c = sqrt(9.81 / k);
        vec2 d = normalize(dir);
        float f = k * (dot(d, p) - c * t);
        float a = steep / k;
        return vec3(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
      }

      void main() {
        vDepth = aDepth;
        vec3 p = position;
        float damp = smoothstep(0.0, 1.4, aDepth);
        p += gerstner(p.xz, vec2(-0.92, 0.38), 0.11 * damp, 14.0, uTime);
        p += gerstner(p.xz, vec2(-0.68, -0.73), 0.07 * damp, 7.8, uTime);
        p += gerstner(p.xz, vec2(-0.42, 0.90), 0.045 * damp, 4.4, uTime);

        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        vReflectProj = uReflectMatrix * wp;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform sampler2D uReflectMap;
      uniform float uUsePlanar;
      uniform vec4 uRipples[12];

      varying vec3 vWorldPos;
      varying float vDepth;
      varying vec4 vReflectProj;

      float hashW(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noiseW(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hashW(i), hashW(i + vec2(1.0, 0.0)), u.x),
                   mix(hashW(i + vec2(0.0, 1.0)), hashW(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      float waveH(vec2 xz) {
        float h = sin(dot(xz, vec2(-0.6, 0.25)) - uTime * 1.6) * 0.05;
        h += sin(dot(xz, vec2(-0.4, -0.8)) - uTime * 2.1) * 0.03;
        h += noiseW(xz * 0.8 + vec2(-uTime * 0.45, uTime * 0.22)) * 0.03;
        return h;
      }

      void main() {
        if (vDepth <= 0.002) discard;

        vec2 xz = vWorldPos.xz;
        float eps = 0.09;
        float h0 = waveH(xz);
        float hx = waveH(xz + vec2(eps, 0.0));
        float hz = waveH(xz + vec2(0.0, eps));
        vec3 N = normalize(vec3(h0 - hx, eps, h0 - hz));

        float rippleFoam = 0.0;
        for (int i = 0; i < 12; i++) {
          vec4 rp = uRipples[i];
          float age = uTime - rp.z;
          if (age > 0.0 && age < 4.0 && rp.w > 0.0) {
            vec2 dv = xz - rp.xy;
            float dist = length(dv);
            float rad = age * 5.2;
            float env = exp(-pow(dist - rad, 2.0) * 1.4) * exp(-age * 0.9) * rp.w;
            if (dist > 0.02) N = normalize(N + vec3(dv.x / dist, 0.0, dv.y / dist) * cos((dist - rad) * 6.5) * env * 0.35);
            rippleFoam += env * 0.5;
          }
        }

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(uSunDir);
        float NdotV = max(dot(N, V), 0.001);
        float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

        // Analytical underwater sand + tropical Beer-Lambert absorption + caustics (no 3rd render pass!)
        float sunVis = smoothstep(-0.08, 0.25, L.y);
        float c1 = abs(sin(xz.x * 1.5 + noiseW(xz * 1.1 + uTime * 0.35) * 3.0));
        float caustics = pow(1.0 - c1, 4.0) * exp(-vDepth * 0.45) * sunVis * 0.45;
        vec3 shallowCol = vec3(0.14, 0.62, 0.64) * (0.3 + 0.7 * max(L.y + 0.15, 0.1)) + vec3(0.25, 0.55, 0.55) * caustics;
        vec3 deepCol = vec3(0.015, 0.08, 0.14) * (0.25 + 0.75 * max(L.y + 0.1, 0.1));
        vec3 refrCol = mix(deepCol, shallowCol, exp(-vDepth * 0.38));

        // Subsurface wave glow
        float sss = pow(max(0.0, dot(V, -L + N * 0.6)), 3.0) * sunVis;
        refrCol += vec3(0.06, 0.52, 0.48) * sss * 0.65;

        // Planar reflection
        vec3 reflCol;
        if (uUsePlanar > 0.5) {
          vec2 ruv = (vReflectProj.xy / vReflectProj.w) * 0.5 + 0.5 + N.xz * 0.045;
          ruv = clamp(ruv, 0.002, 0.998);
          reflCol = texture2D(uReflectMap, ruv).rgb;
        } else {
          vec3 R = reflect(-V, N);
          reflCol = mix(vec3(0.08, 0.14, 0.26), uSunColor * 0.75, smoothstep(0.0, 0.45, R.y));
        }

        vec3 col = mix(refrCol, reflCol, clamp(fresnel * 1.08, 0.05, 0.97));

        // Sun specular glints
        vec3 H = normalize(L + V);
        float NdotH = max(dot(N, H), 0.0);
        col += uSunColor * (pow(NdotH, 360.0) * 7.5 + pow(NdotH, 42.0) * 0.32) * smoothstep(-0.04, 0.1, L.y);

        // Shoreline waves foam
        float foamNoise = noiseW(xz * 2.6 + vec2(-uTime * 0.45, uTime * 0.15));
        float waveShore = sin(vDepth * 7.0 - uTime * 2.4) * 0.5 + 0.5;
        float shoreFoam = (1.0 - smoothstep(0.05, 0.72, vDepth)) * smoothstep(0.35, 0.78, foamNoise * 0.7 + waveShore * 0.35);
        float foam = clamp(shoreFoam + rippleFoam * foamNoise, 0.0, 1.0);
        col = mix(col, vec3(0.88, 0.93, 0.97) * (0.28 + 0.72 * max(L.y + 0.2, 0.1)), foam * 0.78);

        // Atmospheric distance fog
        float dist = length(cameraPosition - vWorldPos);
        float fogF = 1.0 - exp(-pow(dist * 0.0042, 2.0));
        vec3 fogCol = mix(vec3(0.04, 0.04, 0.10), uSunColor * 0.42, sunVis);
        col = mix(col, fogCol, clamp(fogF, 0.0, 0.94));

        gl_FragColor = vec4(col, smoothstep(0.0, 0.18, vDepth));
      }
    `
  });

  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  return {
    mesh,
    triggerRipple(x: number, z: number, strength = 1.2) {
      ripples[rippleIdx].set(x, z, lastElapsed, Math.min(2.4, strength));
      rippleIdx = (rippleIdx + 1) % MAX_RIPPLES;
    },
    update(elapsed: number, sunDir: THREE.Vector3, sunCol: THREE.Color) {
      lastElapsed = elapsed;
      uniforms.uTime.value = elapsed;
      uniforms.uSunDir.value.copy(sunDir);
      uniforms.uSunColor.value.copy(sunCol).multiplyScalar(1.3);
    },
    renderReflection(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
      if (uniforms.uUsePlanar.value < 0.5) return;
      mesh.visible = false;

      reflectCam.fov = camera.fov;
      reflectCam.aspect = camera.aspect;
      reflectCam.near = camera.near;
      reflectCam.far = camera.far;
      reflectCam.updateProjectionMatrix();

      reflectCam.position.copy(camera.position);
      reflectCam.position.y = -camera.position.y;

      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      fwd.y = -fwd.y;
      reflectCam.up.set(0, 1, 0);
      reflectCam.lookAt(reflectCam.position.clone().add(fwd));
      reflectCam.updateMatrixWorld();

      reflectMatrix.multiplyMatrices(reflectCam.projectionMatrix, reflectCam.matrixWorldInverse);
      renderer.clippingPlanes = [clipPlane];
      renderer.setRenderTarget(reflectRT);
      renderer.clear();
      renderer.render(scene, reflectCam);
      renderer.clippingPlanes = [];
      renderer.setRenderTarget(null);

      mesh.visible = true;
    },
    resize(w: number, h: number) {
      reflectRT.setSize(Math.floor(w * scale), Math.floor(h * scale));
    },
    setPlanarEnabled(enabled: boolean) {
      uniforms.uUsePlanar.value = enabled ? 1.0 : 0.0;
    }
  };
}
