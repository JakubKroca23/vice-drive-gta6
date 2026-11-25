import type * as THREE from 'three';

export type TimeOfDayKey = 'sunset' | 'night' | 'noon';

export interface TimeOfDayPreset {
  label: string;
  elevation: number;
  azimuth: number;
  clouds: number;
  exposure: number;
  neonStrength: number;
}

export interface InputState {
  throttle: number; // -1..1
  steer: number;    // -1..1
  handbrake: boolean;
  boost: boolean;
  joyX: number;     // -1..1 for on-foot or mobile steering
  joyY: number;     // -1..1 for on-foot or mobile throttle
}

export interface DynamicProp {
  mesh: THREE.Mesh;
  bodyHandle: number;
  kind: 'cone' | 'crate' | 'barrel' | 'ball';
  inWater: boolean;
  radius: number;
}

export interface TrafficCarData {
  mesh: THREE.Group;
  bodyHandle: number;
  laneX: number;
  dirZ: 1 | -1;
  speed: number;
  z: number;
}

export interface TelemetrySnapshot {
  fps: number;
  speedKmh: number;
  gear: string;
  boostPct: number;
  onFoot: boolean;
  posX: number;
  posZ: number;
  headingRad: number;
  bodiesCount: number;
}
