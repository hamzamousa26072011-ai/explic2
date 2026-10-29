import React, { useEffect, useRef } from 'react';
import { ThemeMode } from '../types';

interface CyberWaveBackgroundProps {
  theme: ThemeMode;
}

interface WaveParticle {
  x: number;
  y: number;
  baseY: number;
  speed: number;
  amplitude: number;
  phase: number;
  radius: number;
}

export const CyberWaveBackground: React.FC<CyberWaveBackgroundProps> = ({
  theme,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeRef = useRef<ThemeMode>(theme);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -1000, y: -1000 });

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId = 0;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const particleCount = 34;
    const particles: WaveParticle[] = Array.from({ length: particleCount }, (_, i) => ({
      x: (i / particleCount) * width,
      y: height * 0.5,
      baseY: height * (0.25 + (i % 5) * 0.12),
      speed: 0.008 + (i % 4) * 0.003,
      amplitude: 16 + (i % 3) * 10,
      phase: i * 0.45,
      radius: 1.5 + (i % 2) * 0.8,
    }));

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    let tick = 0;
    const render = () => {
      tick += 1;
      ctx.clearRect(0, 0, width, height);

      const isWarm = themeRef.current === 'warm';
      const strokeColor = isWarm
        ? 'rgba(201, 111, 85, 0.09)'
        : 'rgba(99, 102, 241, 0.12)';
      const dotColor = isWarm
        ? 'rgba(201, 111, 85, 0.24)'
        : 'rgba(99, 102, 241, 0.32)';

      // Draw gentle undulating sine wave ribbon
      ctx.beginPath();
      for (let x = 0; x <= width; x += 48) {
        const y =
          height * 0.55 +
          Math.sin(x * 0.003 + tick * 0.012) * 28 +
          Math.cos(x * 0.006 - tick * 0.008) * 14;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Update and draw particles with mouse proximity avoidance
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (const p of particles) {
        p.phase += p.speed;
        p.x += 0.25;
        if (p.x > width + 10) p.x = -10;

        let targetY = p.baseY + Math.sin(p.phase) * p.amplitude;
        const dx = p.x - mx;
        const dy = targetY - my;
        const distSq = dx * dx + dy * dy;
        if (distSq < 14400 && distSq > 1) {
          const dist = Math.sqrt(distSq);
          const push = (120 - dist) * 0.25;
          targetY += (dy / dist) * push;
        }
        p.y = targetY;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();
      }

      animationFrameId = window.requestAnimationFrame(render);
    };

    animationFrameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="cyberwave-canvas"
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
    />
  );
};
