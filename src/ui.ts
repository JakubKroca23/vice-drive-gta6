import type { InputState, TelemetrySnapshot, TimeOfDayKey, TrafficCarData } from './types';

export interface UIHooks {
  onPreset: (key: TimeOfDayKey) => void;
  onToggleAudio: () => boolean;
  onToggleOnFoot: () => void;
  onToggleUnderglow: () => boolean;
  onTogglePlanar: (on: boolean) => void;
  onToggleBloom: (on: boolean) => void;
  onToggleShadows: (on: boolean) => void;
  onRespawnCar: () => void;
  onResetProps: () => void;
  onUnlockAudio: () => void;
}

export interface UISystem {
  update: (snap: TelemetrySnapshot, traffic: TrafficCarData[]) => void;
  bindTouchInput: (input: InputState) => void;
}

export function createUISystem(hooks: UIHooks, isMobile: boolean): UISystem {
  const speedEl = document.getElementById('hud-speed')!;
  const gearEl = document.getElementById('hud-gear')!;
  const boostFillEl = document.getElementById('hud-boost-fill')!;
  const fpsEl = document.getElementById('hud-fps')!;
  const footBtn = document.getElementById('btn-foot')!;
  const audioBtn = document.getElementById('btn-audio')!;
  const panel = document.getElementById('studio-panel')!;
  const panelToggle = document.getElementById('btn-studio')!;
  const minimap = document.getElementById('minimap') as HTMLCanvasElement;
  const mctx = minimap.getContext('2d')!;

  const setPanel = (open: boolean) => {
    panel.classList.toggle('collapsed', !open);
    panelToggle.classList.toggle('active', open);
  };
  if (isMobile) setPanel(false);

  panelToggle.addEventListener('click', () => setPanel(panel.classList.contains('collapsed')));
  document.getElementById('btn-close-studio')?.addEventListener('click', () => setPanel(false));

  document.querySelectorAll<HTMLButtonElement>('[data-tod]').forEach((btn) => {
    btn.addEventListener('click', () => {
      hooks.onUnlockAudio();
      document.querySelectorAll('[data-tod]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      hooks.onPreset(btn.dataset.tod as TimeOfDayKey);
    });
  });

  audioBtn.addEventListener('click', () => {
    hooks.onUnlockAudio();
    const on = hooks.onToggleAudio();
    audioBtn.classList.toggle('active', on);
    audioBtn.textContent = on ? '🔊' : '🔇';
  });

  footBtn.addEventListener('click', () => {
    hooks.onUnlockAudio();
    hooks.onToggleOnFoot();
  });

  document.getElementById('btn-respawn')?.addEventListener('click', () => {
    hooks.onUnlockAudio();
    hooks.onRespawnCar();
  });

  document.getElementById('btn-reset-props')?.addEventListener('click', () => {
    hooks.onUnlockAudio();
    hooks.onResetProps();
  });

  const bindSwitch = (id: string, cb: (on: boolean) => void) => {
    const el = document.getElementById(id)!;
    el.addEventListener('click', () => {
      el.classList.toggle('on');
      cb(el.classList.contains('on'));
    });
  };
  bindSwitch('tog-planar', hooks.onTogglePlanar);
  bindSwitch('tog-bloom', hooks.onToggleBloom);
  bindSwitch('tog-shadows', hooks.onToggleShadows);
  bindSwitch('tog-underglow', () => { hooks.onToggleUnderglow(); });

  function drawMinimap(snap: TelemetrySnapshot, traffic: TrafficCarData[]) {
    const w = minimap.width;
    const h = minimap.height;
    mctx.clearRect(0, 0, w, h);

    mctx.save();
    mctx.beginPath();
    mctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    mctx.clip();

    // Ocean + City base
    mctx.fillStyle = '#0c1626';
    mctx.fillRect(0, 0, w, h);

    mctx.translate(w / 2, h / 2);
    const scale = 0.62;

    // Rotate minimap around player heading? Top-down north-up is super readable!
    const ox = -snap.posX * scale;
    const oz = -snap.posZ * scale;

    // Ocean Eastward (x > 34)
    mctx.fillStyle = '#0d3b52';
    mctx.fillRect(34 * scale + ox, -200, 260, 400);

    // Golden Beach (x = 16..35)
    mctx.fillStyle = '#a88d5b';
    mctx.fillRect(16 * scale + ox, -200, 19 * scale, 400);

    // Starfish Island
    mctx.fillStyle = '#2d3748';
    mctx.fillRect(104 * scale + ox, -26 * scale + oz, 48 * scale, 52 * scale);

    // Ocean Drive & Cross Street & Bridge
    mctx.fillStyle = '#475569';
    mctx.fillRect(-14 * scale + ox, -160 * scale + oz, 28 * scale, 320 * scale);
    mctx.fillRect(-65 * scale + ox, -9 * scale + oz, 85 * scale, 18 * scale);
    // Bridge
    mctx.fillRect(18 * scale + ox, -7 * scale + oz, 88 * scale, 14 * scale);

    // Traffic Cars
    mctx.fillStyle = '#ffd43b';
    traffic.forEach((tc) => {
      const tx = tc.laneX * scale + ox;
      const tz = tc.z * scale + oz;
      mctx.beginPath();
      mctx.arc(tx, tz, 3, 0, Math.PI * 2);
      mctx.fill();
    });

    // Player Arrow
    mctx.rotate(-snap.headingRad);
    mctx.fillStyle = '#ff2a9d';
    mctx.beginPath();
    mctx.moveTo(0, 6);
    mctx.lineTo(-4.5, -5);
    mctx.lineTo(0, -2.5);
    mctx.lineTo(4.5, -5);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  return {
    bindTouchInput(input: InputState) {
      const joyZone = document.getElementById('touch-joystick')!;
      const joyKnob = document.getElementById('touch-knob')!;
      let joyPointerId: number | null = null;
      let centerX = 0;
      let centerY = 0;
      const maxRad = 42;

      joyZone.addEventListener('pointerdown', (e) => {
        hooks.onUnlockAudio();
        e.stopPropagation();
        joyPointerId = e.pointerId;
        joyZone.setPointerCapture(e.pointerId);
        const rect = joyZone.getBoundingClientRect();
        centerX = rect.left + rect.width / 2;
        centerY = rect.top + rect.height / 2;
      });

      joyZone.addEventListener('pointermove', (e) => {
        if (e.pointerId !== joyPointerId) return;
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(maxRad, dist);
        const ang = Math.atan2(dy, dx);
        const kx = Math.cos(ang) * clamped;
        const ky = Math.sin(ang) * clamped;
        joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
        input.joyX = kx / maxRad;
        input.joyY = -ky / maxRad;
      });

      const resetJoy = (e: PointerEvent) => {
        if (e.pointerId !== joyPointerId) return;
        joyPointerId = null;
        joyKnob.style.transform = 'translate(0px, 0px)';
        input.joyX = 0;
        input.joyY = 0;
      };
      joyZone.addEventListener('pointerup', resetJoy);
      joyZone.addEventListener('pointercancel', resetJoy);

      const bindPedal = (id: string, onDown: () => void, onUp: () => void) => {
        const el = document.getElementById(id)!;
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          hooks.onUnlockAudio();
          el.classList.add('pressed');
          onDown();
        });
        const release = (e: PointerEvent) => {
          e.preventDefault();
          el.classList.remove('pressed');
          onUp();
        };
        el.addEventListener('pointerup', release);
        el.addEventListener('pointercancel', release);
      };

      bindPedal('pedal-gas', () => { input.throttle = 1; }, () => { input.throttle = 0; });
      bindPedal('pedal-brake', () => { input.throttle = -1; input.handbrake = true; }, () => { input.throttle = 0; input.handbrake = false; });
      bindPedal('pedal-nitro', () => { input.boost = true; input.throttle = 1; }, () => { input.boost = false; input.throttle = 0; });
    },
    update(snap: TelemetrySnapshot, traffic: TrafficCarData[]) {
      speedEl.textContent = snap.onFoot ? 'PĚŠKY' : `${snap.speedKmh}`;
      gearEl.textContent = snap.onFoot ? 'ON FOOT' : `${snap.gear} · KM/H`;
      boostFillEl.style.width = `${Math.round(snap.boostPct)}%`;
      fpsEl.textContent = `${snap.fps} FPS · ${snap.bodiesCount} těles (WASM)`;
      footBtn.textContent = snap.onFoot ? '🚗 Nastoupit' : '🚶 Vystoupit';
      drawMinimap(snap, traffic);
    }
  };
}
