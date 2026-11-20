import { LOOPS, ONE_SHOTS, type HouseSound, type Loop, type OneShot } from '@us/shared/house';

/**
 * Our House's sounds in the browser (Web Audio): everything is fetched once
 * from the house pack and decoded; loops fade in and out. Browsers keep
 * sound off until the first click or key, so it starts then.
 */
export function webHouseSound(base: string): HouseSound {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const buffers = new Map<string, AudioBuffer>();
  for (const name of [...ONE_SHOTS, ...LOOPS]) {
    void fetch(`${base}/sounds/${name}.wav`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => buffers.set(name, buf))
      .catch(() => {});
  }
  const wake = () => void ctx.resume().catch(() => {});
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);

  const loops = new Map<Loop, { src: AudioBufferSourceNode; gain: GainNode }>();
  return {
    play(name: OneShot, volume: number) {
      const buf = buffers.get(name);
      if (!buf || ctx.state !== 'running' || volume <= 0.01) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      // A touch of variety, so footsteps don't sound like a machine.
      src.playbackRate.value = name.startsWith('step_') ? 0.9 + Math.random() * 0.2 : 1;
      const g = ctx.createGain();
      g.gain.value = volume;
      src.connect(g).connect(master);
      src.start();
    },
    loop(name: Loop, volume: number, offset = 0) {
      const on = loops.get(name);
      if (volume <= 0.005) {
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
      gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.4);
      src.connect(gain).connect(master);
      src.start(0, offset % buf.duration);
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
}
