import { ISLE_LOOPS, ISLE_SHOTS, type IsleLoop, type IsleShot, type IsleSound } from '@us/shared/isle';

/**
 * Isle's sounds in the browser (Web Audio), from public/isle/sounds: each is
 * fetched once and decoded; loops fade in and out. Browsers keep sound off
 * until the first click or key, so it starts then.
 */
export function webIsleSound(base = '/isle/sounds'): IsleSound {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const buffers = new Map<string, AudioBuffer>();
  const wanted = new Map<IsleLoop, number>();
  for (const name of [...ISLE_SHOTS, ...ISLE_LOOPS]) {
    void fetch(`${base}/${name}.wav`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        buffers.set(name, buf);
        // A loop asked for before it had loaded starts now.
        const v = wanted.get(name as IsleLoop);
        if (v) api.loop(name as IsleLoop, v);
      })
      .catch(() => {});
  }
  const loops = new Map<IsleLoop, { src: AudioBufferSourceNode; gain: GainNode }>();
  const wake = () => {
    void ctx.resume().then(() => {
      for (const [name, v] of wanted) if (!loops.has(name)) api.loop(name, v);
    }).catch(() => {});
  };
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);

  const api: IsleSound = {
    play(name: IsleShot, volume: number) {
      const buf = buffers.get(name);
      if (!buf || ctx.state !== 'running' || volume <= 0.01) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      // A touch of variety, so the same knock doesn't sound like a machine.
      if (name === 'town' || name === 'road' || name === 'click') src.playbackRate.value = 0.94 + Math.random() * 0.12;
      const g = ctx.createGain();
      g.gain.value = volume;
      src.connect(g).connect(master);
      src.start();
    },
    loop(name: IsleLoop, volume: number) {
      wanted.set(name, volume);
      const on = loops.get(name);
      if (volume <= 0.005) {
        wanted.delete(name);
        if (on) {
          on.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
          on.src.stop(ctx.currentTime + 1.2);
          loops.delete(name);
        }
        return;
      }
      if (on) {
        on.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.4);
        return;
      }
      const buf = buffers.get(name);
      if (!buf || ctx.state !== 'running') return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.6);
      src.connect(gain).connect(master);
      src.start();
      loops.set(name, { src, gain });
    },
    setMaster(volume: number) {
      master.gain.setTargetAtTime(volume, ctx.currentTime, 0.1);
    },
    dispose() {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      void ctx.close().catch(() => {});
    },
  };
  return api;
}
