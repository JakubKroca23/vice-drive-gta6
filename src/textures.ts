import * as THREE from 'three';

function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

export function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm(x: number, y: number, octaves = 4): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * (valueNoise(x * freq, y * freq) * 2 - 1);
    freq *= 2.04;
    amp *= 0.5;
  }
  return v;
}

function heightToNormalMap(heightData: Float32Array, size: number, strength = 2.2): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;

  const sample = (x: number, y: number): number => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return heightData[wy * size + wx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br - tl - 2 * l - bl) * strength;
      const dy = (bl + 2 * b + br - tl - 2 * t - tr) * strength;
      const dz = 1.0;
      const inv = 1.0 / Math.hypot(dx, dy, dz);
      const idx = (y * size + x) * 4;
      d[idx] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      d[idx + 2] = Math.round((dz * inv * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export interface PBRTexSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  emissiveMap?: THREE.CanvasTexture;
}

export function createWetAsphaltPBR(size = 512): PBRTexSet {
  const aCanvas = document.createElement('canvas');
  const rCanvas = document.createElement('canvas');
  aCanvas.width = rCanvas.width = size;
  aCanvas.height = rCanvas.height = size;
  const actx = aCanvas.getContext('2d')!;
  const rctx = rCanvas.getContext('2d')!;
  const aImg = actx.createImageData(size, size);
  const rImg = rctx.createImageData(size, size);
  const hMap = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const grit = hash2(x * 1.13, y * 1.71) * 0.35 + fbm(u * 26, v * 26, 3) * 0.25;
      const puddleNoise = fbm(u * 4.5 + 1.2, v * 4.5 + 3.4, 3);
      const puddle = Math.max(0, Math.min(1, (puddleNoise - 0.04) * 3.5));

      hMap[y * size + x] = grit * (1 - puddle * 0.85);

      const base = (36 + grit * 24) * (1 - puddle * 0.32);
      const idx = (y * size + x) * 4;
      aImg.data[idx] = Math.max(0, Math.min(255, base));
      aImg.data[idx + 1] = Math.max(0, Math.min(255, base * 1.02));
      aImg.data[idx + 2] = Math.max(0, Math.min(255, base * 1.06));
      aImg.data[idx + 3] = 255;

      // Mirror-smooth wet puddles (roughness ~ 20), damp asphalt (~ 145)
      const rough = Math.round(150 * (1 - puddle) + 18 * puddle + grit * 25);
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = Math.max(12, Math.min(240, rough));
      rImg.data[idx + 3] = 255;
    }
  }
  actx.putImageData(aImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);

  // Double yellow center lines + white dashed lane dividers
  actx.fillStyle = 'rgba(242, 184, 48, 0.9)';
  actx.fillRect(size * 0.482, 0, size * 0.012, size);
  actx.fillRect(size * 0.506, 0, size * 0.012, size);

  actx.fillStyle = 'rgba(235, 240, 245, 0.78)';
  for (let dash = 0; dash < 4; dash++) {
    const y0 = dash * (size / 4) + size * 0.04;
    actx.fillRect(size * 0.25, y0, size * 0.012, size * 0.14);
    actx.fillRect(size * 0.738, y0, size * 0.012, size * 0.14);
  }

  const map = new THREE.CanvasTexture(aCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  const normalMap = heightToNormalMap(hMap, size, 1.5);
  return { map, roughnessMap, normalMap };
}

export function createSandPBR(size = 256): PBRTexSet {
  const aCanvas = document.createElement('canvas');
  const rCanvas = document.createElement('canvas');
  aCanvas.width = rCanvas.width = size;
  aCanvas.height = rCanvas.height = size;
  const actx = aCanvas.getContext('2d')!;
  const rctx = rCanvas.getContext('2d')!;
  const aImg = actx.createImageData(size, size);
  const rImg = rctx.createImageData(size, size);
  const hMap = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const ripple = Math.sin(u * Math.PI * 16 + fbm(u * 6, v * 6, 3) * 3.0) * 0.5 + 0.5;
      const grain = hash2(x * 0.9, y * 1.3) * 0.35;
      const h = ripple * 0.55 + grain * 0.45;
      hMap[y * size + x] = h;

      const shade = 0.85 + h * 0.22;
      const idx = (y * size + x) * 4;
      aImg.data[idx] = Math.min(255, Math.round(218 * shade));
      aImg.data[idx + 1] = Math.min(255, Math.round(192 * shade));
      aImg.data[idx + 2] = Math.min(255, Math.round(148 * shade));
      aImg.data[idx + 3] = 255;

      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = Math.round(185 + grain * 55);
      rImg.data[idx + 3] = 255;
    }
  }
  actx.putImageData(aImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);
  const map = new THREE.CanvasTexture(aCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  const normalMap = heightToNormalMap(hMap, size, 1.8);
  return { map, roughnessMap, normalMap };
}

export function createSkyscraperFacadePBR(size = 512): PBRTexSet {
  const aCanvas = document.createElement('canvas');
  const rCanvas = document.createElement('canvas');
  const eCanvas = document.createElement('canvas');
  aCanvas.width = rCanvas.width = eCanvas.width = size;
  aCanvas.height = rCanvas.height = eCanvas.height = size;
  const actx = aCanvas.getContext('2d')!;
  const rctx = rCanvas.getContext('2d')!;
  const ectx = eCanvas.getContext('2d')!;

  // Base concrete/metal mullions
  actx.fillStyle = '#232b38';
  actx.fillRect(0, 0, size, size);
  rctx.fillStyle = '#a0a0a0';
  rctx.fillRect(0, 0, size, size);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, size, size);

  const cols = 8;
  const rows = 16;
  const cellW = size / cols;
  const cellH = size / rows;
  const hMap = new Float32Array(size * size);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = c * cellW + 4;
      const wy = r * cellH + 3;
      const ww = cellW - 8;
      const wh = cellH - 6;

      // Reflective glass pane
      actx.fillStyle = '#3d5873';
      actx.fillRect(wx, wy, ww, wh);
      rctx.fillStyle = '#181818'; // glossy glass!
      rctx.fillRect(wx, wy, ww, wh);

      // Some rooms lit warm gold / Miami cyan
      const rnd = hash2(c * 3.1 + 7, r * 5.7 + 2);
      if (rnd > 0.58) {
        ectx.fillStyle = rnd > 0.88 ? '#6ef7ff' : rnd > 0.72 ? '#ffcf86' : '#ffe3b3';
        ectx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
      }
    }
  }

  // Mullion relief heightmap
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x % cellW;
      const gy = y % cellH;
      hMap[y * size + x] = gx < 4 || gx > cellW - 4 || gy < 3 || gy > cellH - 3 ? 0.8 : 0.1;
    }
  }

  const map = new THREE.CanvasTexture(aCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;

  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  const emissiveMap = new THREE.CanvasTexture(eCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;

  const normalMap = heightToNormalMap(hMap, size, 1.4);
  return { map, roughnessMap, normalMap, emissiveMap };
}
