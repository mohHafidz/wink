import { useEffect, useRef, type FC } from 'react';
import { ThemeMode } from '../types';

interface WaveCanvasProps {
  id?: string;
  width?: number;
  height?: number;
  isPlaying: boolean;
  theme: ThemeMode;
}

export const WaveCanvas: FC<WaveCanvasProps> = ({
  width = 58,
  height = 20,
  isPlaying,
  theme,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timeRef = useRef<number>(0);
  const animIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      if (isPlaying) {
        // Relaxed fluid wave speed for One UI tranquil grace
        timeRef.current += 0.018;
      }

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const midY = height / 2;
      const p1: { x: number; y: number }[] = [];
      const p2: { x: number; y: number }[] = [];

      // Mathematical Harmonic Sine Generation with Smooth Bell-Curve Taper
      // Guarantees zero cutoff at left and right edges
      const step = 1.2;
      const t = timeRef.current;

      for (let x = 0; x <= width; x += step) {
        const norm = x / width;
        const envelope = Math.sin(norm * Math.PI);
        const powerEnvelope = Math.pow(Math.max(0, envelope), 0.65);

        // Scale amplitude proportionally if height is smaller (e.g. in micro-pulse stealth)
        const scaleFactor = Math.min(1.0, height / 20.0);
        const amp1 = (isPlaying ? 5.0 * scaleFactor : 0.4) * powerEnvelope;
        const amp2 = (isPlaying ? 3.4 * scaleFactor : 0.2) * powerEnvelope;

        // Two interacting harmonic wave frequencies
        const y1 =
          midY +
          Math.sin(x * 0.12 + t * 1.6) * amp1 +
          Math.cos(x * 0.06 - t * 1.1) * (amp1 * 0.4);
        const y2 =
          midY +
          Math.cos(x * 0.1 - t * 1.3 + 1.0) * amp2 +
          Math.sin(x * 0.05 + t * 0.8) * (amp2 * 0.45);

        p1.push({ x, y: y1 });
        p2.push({ x, y: y2 });
      }

      const isLight = theme === 'light';

      // 1. Extra Soft Volumetric Liquid Gradient Fill
      if (isPlaying && p1.length > 2) {
        const fillGrad = ctx.createLinearGradient(0, 0, 0, height);
        if (isLight) {
          fillGrad.addColorStop(0, 'rgba(91, 127, 224, 0.16)');
          fillGrad.addColorStop(0.6, 'rgba(47, 138, 93, 0.06)');
          fillGrad.addColorStop(1, 'rgba(47, 138, 93, 0.0)');
        } else {
          fillGrad.addColorStop(0, 'rgba(168, 196, 255, 0.20)');
          fillGrad.addColorStop(0.6, 'rgba(160, 223, 189, 0.07)');
          fillGrad.addColorStop(1, 'rgba(160, 223, 189, 0.0)');
        }

        ctx.beginPath();
        ctx.moveTo(p1[0].x, p1[0].y);
        for (let i = 1; i < p1.length; i++) {
          ctx.lineTo(p1[i].x, p1[i].y);
        }
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = fillGrad;
        ctx.fill();
      }

      // Foreground gradients: soft pastels on dark, deeper muted tones on light
      const grad1 = ctx.createLinearGradient(0, 0, width, 0);
      const grad2 = ctx.createLinearGradient(0, 0, width, 0);

      if (isLight) {
        grad1.addColorStop(0, '#5B7FE0'); // Muted Periwinkle
        grad1.addColorStop(0.38, '#3E9E72'); // Muted Sage
        grad1.addColorStop(0.72, '#D39A2C'); // Muted Amber
        grad1.addColorStop(1, '#E06A6A'); // Muted Coral

        grad2.addColorStop(0, '#E89A9A');
        grad2.addColorStop(0.4, '#93A9E8');
        grad2.addColorStop(0.75, '#86C7A6');
        grad2.addColorStop(1, '#E8C27A');
      } else {
        grad1.addColorStop(0, '#A8C4FF'); // Soft Periwinkle
        grad1.addColorStop(0.38, '#A0DFBD'); // Soft Mint Sage
        grad1.addColorStop(0.72, '#FDE2A7'); // Soft Cream Amber
        grad1.addColorStop(1, '#FFBDBD'); // Soft Blossom Coral

        grad2.addColorStop(0, '#FFC2C2');
        grad2.addColorStop(0.4, '#C2D4FF');
        grad2.addColorStop(0.75, '#C6F0DC');
        grad2.addColorStop(1, '#FFE8BE');
      }

      // 2. Secondary Harmonic Background Wave (Depth layer)
      if (p2.length > 2) {
        ctx.beginPath();
        ctx.moveTo(p2[0].x, p2[0].y);
        for (let i = 1; i < p2.length; i++) {
          ctx.lineTo(p2[i].x, p2[i].y);
        }
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = grad2;
        ctx.globalAlpha = isLight ? 0.5 : 0.28;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }

      // 3. Volumetric Glow Tube Halo
      if (p1.length > 2) {
        ctx.beginPath();
        ctx.moveTo(p1[0].x, p1[0].y);
        for (let i = 1; i < p1.length; i++) {
          ctx.lineTo(p1[i].x, p1[i].y);
        }
        ctx.lineWidth = 3.6;
        ctx.strokeStyle = grad1;
        ctx.globalAlpha = isLight ? 0.18 : 0.24;
        ctx.shadowBlur = 5;
        ctx.shadowColor = isLight ? 'rgba(91, 127, 224, 0.45)' : '#A8C4FF';
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;

        // 4. Core 3D Liquid Wave
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = grad1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        // 5. Specular Gloss Highlight along peaks
        ctx.beginPath();
        ctx.moveTo(p1[0].x, p1[0].y - 0.7);
        for (let i = 1; i < p1.length; i++) {
          ctx.lineTo(p1[i].x, p1[i].y - 0.7);
        }
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = isLight
          ? 'rgba(255, 255, 255, 0.55)'
          : 'rgba(255, 255, 255, 0.65)';
        ctx.stroke();
      }

      ctx.restore();
      animIdRef.current = requestAnimationFrame(render);
    };

    animIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animIdRef.current) {
        cancelAnimationFrame(animIdRef.current);
      }
    };
  }, [width, height, isPlaying, theme]);

  return (
    <div
      className="relative flex items-center justify-center rounded-full bg-white/[0.04] p-0.5 border border-white/[0.08] shadow-inner select-none pointer-events-none"
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: `${width}px`, height: `${height}px`, display: 'block' }}
      />
    </div>
  );
};
