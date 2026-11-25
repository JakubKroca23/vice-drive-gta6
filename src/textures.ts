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
      const grit = hash2(x * 1.13, y * 1.71) * 0.35 + fbm(u * 30, v * 30, 3) * 0.25;
      const puddleNoise = fbm(u * 4.2 + 1.2, v * 4.2 + 3.4, 3);
      const puddle = Math.max(0, Math.min(1, (puddleNoise - 0.03) * 3.8));
      // Subtle tire track darkening in center of lanes
      const laneDist = Math.min(
        Math.abs(u - 0.16), Math.abs(u - 0.35),
        Math.abs(u - 0.65), Math.abs(u - 0.84)
      );
      const trackWear = Math.exp(-Math.pow(laneDist / 0.04, 2)) * 0.18;

      hMap[y * size + x] = grit * (1 - puddle * 0.88);

      const base = (38 + grit * 22) * (1 - puddle * 0.34 - trackWear);
      const idx = (y * size + x) * 4;
      aImg.data[idx] = Math.max(0, Math.min(255, base));
      aImg.data[idx + 1] = Math.max(0, Math.min(255, base * 1.02));
      aImg.data[idx + 2] = Math.max(0, Math.min(255, base * 1.07));
      aImg.data[idx + 3] = 255;

      const rough = Math.round(145 * (1 - puddle) + 14 * puddle + grit * 22 - trackWear * 40);
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = Math.max(10, Math.min(240, rough));
      rImg.data[idx + 3] = 255;
    }
  }
  actx.putImageData(aImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);

  // Double yellow center divider + white dashed lane dividers + edge lines
  actx.fillStyle = 'rgba(244, 186, 44, 0.92)';
  actx.fillRect(size * 0.483, 0, size * 0.011, size);
  actx.fillRect(size * 0.506, 0, size * 0.011, size);

  actx.fillStyle = 'rgba(235, 240, 246, 0.82)';
  actx.fillRect(size * 0.02, 0, size * 0.009, size);
  actx.fillRect(size * 0.971, 0, size * 0.009, size);
  for (let dash = 0; dash < 4; dash++) {
    const y0 = dash * (size / 4) + size * 0.04;
    actx.fillRect(size * 0.25, y0, size * 0.011, size * 0.14);
    actx.fillRect(size * 0.739, y0, size * 0.011, size * 0.14);
  }

  const map = new THREE.CanvasTexture(aCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  const normalMap = heightToNormalMap(hMap, size, 1.45);
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
      aImg.data[idx] = Math.min(255, Math.round(220 * shade));
      aImg.data[idx + 1] = Math.min(255, Math.round(194 * shade));
      aImg.data[idx + 2] = Math.min(255, Math.round(150 * shade));
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

export function createPalmBarkPBR(size = 256): PBRTexSet {
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
      // Distinct palm trunk ring scars + vertical fibers
      const ring = Math.pow(Math.abs(Math.sin(v * Math.PI * 22 + fbm(u * 4, v * 8, 2) * 0.9)), 0.6);
      const fiber = valueNoise(u * 48, v * 12) * 0.35;
      const h = ring * 0.72 + fiber * 0.28;
      hMap[y * size + x] = h;

      const idx = (y * size + x) * 4;
      const s = 0.65 + h * 0.45;
      aImg.data[idx] = Math.min(255, Math.round(122 * s));
      aImg.data[idx + 1] = Math.min(255, Math.round(98 * s));
      aImg.data[idx + 2] = Math.min(255, Math.round(76 * s));
      aImg.data[idx + 3] = 255;

      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = Math.round(195 + (1 - h) * 45);
      rImg.data[idx + 3] = 255;
    }
  }
  actx.putImageData(aImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);
  const map = new THREE.CanvasTexture(aCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 5);
  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(1, 5);
  const normalMap = heightToNormalMap(hMap, size, 2.8);
  normalMap.repeat.set(1, 5);
  return { map, roughnessMap, normalMap };
}

export function createCarbonFiberPBR(size = 128): PBRTexSet {
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
      const cell = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0);
      const wave = cell
        ? Math.sin((x % 4) / 4 * Math.PI)
        : Math.sin((y % 4) / 4 * Math.PI);
      hMap[y * size + x] = wave * 0.5;
      const lum = cell ? 24 + wave * 24 : 18 + wave * 18;
      const idx = (y * size + x) * 4;
      aImg.data[idx] = aImg.data[idx + 1] = aImg.data[idx + 2] = lum;
      aImg.data[idx + 3] = 255;
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = Math.round(55 + (1 - wave) * 65);
      rImg.data[idx + 3] = 255;
    }
  }
  actx.putImageData(aImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);
  const map = new THREE.CanvasTexture(aCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(8, 8);
  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(8, 8);
  const normalMap = heightToNormalMap(hMap, size, 1.4);
  normalMap.repeat.set(8, 8);
  return { map, roughnessMap, normalMap };
}

export function createArtDecoFacadePBR(size = 512): PBRTexSet {
  const aCanvas = document.createElement('canvas');
  const rCanvas = document.createElement('canvas');
  const eCanvas = document.createElement('canvas');
  aCanvas.width = rCanvas.width = eCanvas.width = size;
  aCanvas.height = rCanvas.height = eCanvas.height = size;
  const actx = aCanvas.getContext('2d')!;
  const rctx = rCanvas.getContext('2d')!;
  const ectx = eCanvas.getContext('2d')!;

  // Stucco plaster base
  actx.fillStyle = '#efe1d1';
  actx.fillRect(0, 0, size, size);
  rctx.fillStyle = '#c8c8c8';
  rctx.fillRect(0, 0, size, size);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, size, size);

  // Add subtle stucco micro-grain
  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    actx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.04)';
    actx.fillRect(x, y, 2, 2);
  }

  const hMap = new Float32Array(size * size);
  // Horizontal Art Deco architectural bands
  for (let y = 0; y < size; y++) {
    const band = Math.sin((y / size) * Math.PI * 12) > 0.92 ? 0.65 : 0.2;
    for (let x = 0; x < size; x++) {
      hMap[y * size + x] = band;
    }
  }

  // Windows & ground floor hotel lobby glass
  const cols = 6;
  const rows = 4;
  const cw = size / cols;
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isGround = r === rows - 1;
      const wx = c * cw + (isGround ? 6 : 12);
      const wy = r * rh + (isGround ? 14 : 18);
      const ww = cw - (isGround ? 12 : 24);
      const wh = rh - (isGround ? 20 : 32);

      // Frame
      actx.fillStyle = '#d4c3b0';
      actx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);

      // Tinted architectural glass
      actx.fillStyle = isGround ? '#304358' : '#26384c';
      actx.fillRect(wx, wy, ww, wh);
      rctx.fillStyle = '#181818';
      rctx.fillRect(wx, wy, ww, wh);

      // Warm hotel lobby / lit room windows
      const rnd = hash2(c * 4.3 + 1, r * 7.1 + 3);
      if (isGround || rnd > 0.45) {
        ectx.fillStyle = isGround ? '#ffcf8c' : rnd > 0.8 ? '#7af5ff' : '#ffdca8';
        ectx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
      }

      for (let yy = Math.floor(wy); yy < Math.min(size, wy + wh); yy++) {
        for (let xx = Math.floor(wx); xx < Math.min(size, wx + ww); xx++) {
          hMap[yy * size + xx] = 0.02;
        }
      }
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
  const normalMap = heightToNormalMap(hMap, size, 1.8);
  return { map, roughnessMap, normalMap, emissiveMap };
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

  actx.fillStyle = '#1c2430';
  actx.fillRect(0, 0, size, size);
  rctx.fillStyle = '#909090';
  rctx.fillRect(0, 0, size, size);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, size, size);

  const cols = 10;
  const rows = 20;
  const cellW = size / cols;
  const cellH = size / rows;
  const hMap = new Float32Array(size * size);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = c * cellW + 3;
      const wy = r * cellH + 3;
      const ww = cellW - 6;
      const wh = cellH - 6;

      actx.fillStyle = '#365470';
      actx.fillRect(wx, wy, ww, wh);
      rctx.fillStyle = '#121212';
      rctx.fillRect(wx, wy, ww, wh);

      const rnd = hash2(c * 3.1 + 7, r * 5.7 + 2);
      if (rnd > 0.60) {
        ectx.fillStyle = rnd > 0.9 ? '#6ef7ff' : rnd > 0.74 ? '#ffcf86' : '#ffe3b3';
        ectx.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
      }
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x % cellW;
      const gy = y % cellH;
      hMap[y * size + x] = gx < 3 || gx > cellW - 3 || gy < 3 || gy > cellH - 3 ? 0.8 : 0.1;
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
