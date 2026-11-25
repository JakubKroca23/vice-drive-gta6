import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export interface PostProcessingSystem {
  composer: EffectComposer;
  setExposure: (ev: number) => void;
  setBloomEnabled: (on: boolean) => void;
  resize: (w: number, h: number) => void;
  render: (elapsed: number) => void;
}

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  isMobile: boolean
): PostProcessingSystem {
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(
    Math.floor(window.innerWidth * pr),
    Math.floor(window.innerHeight * pr),
    {
      type: THREE.HalfFloatType,
      samples: isMobile ? 0 : 4
    }
  );

  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.36,
    0.58,
    1.04
  );
  composer.addPass(bloomPass);

  const lensPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uExposure: { value: 1.08 },
      uTime: { value: 0 },
      uChromatic: { value: isMobile ? 0.0005 : 0.0016 }
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform float uExposure;
      uniform float uTime;
      uniform float uChromatic;
      varying vec2 vUv;

      vec3 aces(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }

      float rand(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec2 dir = vUv - 0.5;
        float dist = length(dir);
        float ca = uChromatic * dist * dist;

        vec3 col;
        col.r = texture2D(tDiffuse, vUv + dir * ca).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - dir * ca).b;

        col *= uExposure;
        col *= mix(0.72, 1.0, smoothstep(0.95, 0.35, dist));
        col = aces(col);
        col = pow(col, vec3(1.0 / 2.2));
        col += (rand(vUv * 512.0 + fract(uTime)) - 0.5) * 0.01;
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `
  });
  composer.addPass(lensPass);

  return {
    composer,
    setExposure(ev: number) {
      lensPass.uniforms.uExposure.value = ev;
    },
    setBloomEnabled(on: boolean) {
      bloomPass.enabled = on;
      lensPass.uniforms.uChromatic.value = on ? (isMobile ? 0.0005 : 0.0016) : 0.0;
    },
    resize(w: number, h: number) {
      composer.setSize(w, h);
      bloomPass.setSize(w, h);
    },
    render(elapsed: number) {
      lensPass.uniforms.uTime.value = elapsed;
      composer.render();
    }
  };
}
