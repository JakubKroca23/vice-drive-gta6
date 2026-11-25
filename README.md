# VICE DRIVE VI — Mini GTA 6 (TypeScript + Three.js + Rapier3D WASM)

Interaktivní 3D pobřežní město inspirované Vice City / Leonida v TypeScriptu a Vite, postavené na Three.js WebGL2 HDR pipeline a fyzice **Rapier3D WASM**.

## Hlavní technologie & optimalizace

- **TypeScript + Vite** modulární architektura (`src/city.ts`, `src/ocean.ts`, `src/sky.ts`, `src/physics.ts`, `src/vehicle.ts`, `src/postprocessing.ts`, `src/audio.ts`, `src/ui.ts`)
- **Rapier3D WASM (`@dimforge/rapier3d-compat`)**: nativní `DynamicRayCastVehicleController` (4kolové odpružení, driftování s úpravou bočního tření, Nitro boost, skoky ze stunt ramp), trimesh kolize pláže a zničitelné překážky
- **Single-Pass Ocean Reflection Shader**: zredukován na 1 planární odrazový průchod (analytická Beer-Lambert absorpce hloubky & kaustiky bez 3. refrakčního renderu), Gerstnerovy vlny a dynamické šplouchnutí
- **Geometry Merging & Instancing**: budovy, chodníky, most, přes 100 palem a pouliční lampy sloučeny do minima draw-callů
- **HDR Post-Processing & Procedurální Web Audio**: selektivní `UnrealBloomPass`, ACES Filmic tone mapping, generovaný zvuk motoru, skřípění gum a šplouchnutí
- **Plně responzivní mobilní ovládání**: virtuální joystick, pedály (`PLYN`, `DRIFT`, `NITRO`), automaticky sbalený panel nastavení

## Vývoj a build

```bash
npm install
npm run dev      # lokální vývojový server
npm run build    # TypeScript kontrola + produkční build do dist/
```
