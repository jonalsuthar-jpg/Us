'use client';

/**
 * Dev-only sticker lab: makes a test "photo" (a ball on a busy background),
 * lifts the ball out with the same cut-out the sticker maker uses, and shows
 * the result on a checkerboard. window.__sticker reports what came out, for
 * automated checks.
 */
import { notFound } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { composeSticker, liftSubject, loadImage } from '@/components/stickers/cutout';

function testPhoto(): string {
  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 600;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 600);
  sky.addColorStop(0, '#9fd3ff');
  sky.addColorStop(1, '#e8f4d8');
  g.fillStyle = sky;
  g.fillRect(0, 0, 800, 600);
  g.fillStyle = '#5c9b4a';
  g.fillRect(0, 430, 800, 170);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `hsl(${(i * 47) % 360} 40% 70% / 0.35)`;
    g.fillRect((i * 97) % 800, (i * 53) % 420, 40, 40);
  }
  const ball = g.createRadialGradient(370, 260, 20, 400, 300, 150);
  ball.addColorStop(0, '#ff8a6b');
  ball.addColorStop(1, '#c0281f');
  g.fillStyle = ball;
  g.beginPath();
  g.arc(400, 300, 150, 0, Math.PI * 2);
  g.fill();
  return c.toDataURL('image/png');
}

export default function StickerLab() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Lab />;
}

function Lab() {
  const [src, setSrc] = useState<string | null>(null);
  const [out, setOut] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading the cut-out model…');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const s = testPhoto();
    setSrc(s);
    void (async () => {
      try {
        const img = await loadImage(s);
        const t0 = performance.now();
        const subject = await liftSubject(img, 0.5, 0.5);
        if (!subject) throw new Error('nothing lifted');
        const sticker = composeSticker(subject, 14)!;
        const px = sticker.getContext('2d')!.getImageData(0, 0, sticker.width, sticker.height).data;
        const alpha = (x: number, y: number) => px[(y * sticker.width + x) * 4 + 3]!;
        const report = { ms: Math.round(performance.now() - t0), size: sticker.width, corner: alpha(2, 2), centre: alpha(256, 256) };
        (window as unknown as { __sticker: unknown }).__sticker = report;
        setOut(sticker.toDataURL('image/png'));
        setStatus(JSON.stringify(report));
      } catch (e) {
        (window as unknown as { __sticker: unknown }).__sticker = { error: (e as Error).message };
        setStatus(`Failed: ${(e as Error).message}`);
      }
    })();
  }, []);

  return (
    <div className="flex min-h-dvh flex-wrap items-start gap-6 bg-paper-sunken p-6 text-ink">
      <h1 className="w-full font-display text-heading">Sticker lab</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="Test photo" className="w-[400px] rounded-xl" /> : null}
      <div
        className="flex h-[300px] w-[300px] items-center justify-center rounded-xl"
        style={{ backgroundImage: 'conic-gradient(#EDE8EC 25%, #FFFFFF 0 50%, #EDE8EC 0 75%, #FFFFFF 0)', backgroundSize: '24px 24px' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {out ? <img src={out} alt="Sticker" className="h-full w-full" /> : null}
      </div>
      <p data-testid="status" className="w-full font-mono text-small">
        {status}
      </p>
    </div>
  );
}
