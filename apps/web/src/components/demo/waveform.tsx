'use client';

import { useEffect, useRef } from 'react';

/**
 * Rolling input-level meter.
 *
 * Drawn on a canvas from the worklet's per-frame energy rather than from React
 * state — at 50 frames a second, re-rendering a component per frame would cost
 * more than the audio pipeline it is visualising.
 */
export function Waveform({
  energyRef,
  active,
  className,
}: {
  energyRef: React.RefObject<number>;
  active: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const BARS = 56;
    const history = historyRef.current;

    const render = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      history.push(active ? Math.min(1, energyRef.current * 7) : 0);
      while (history.length > BARS) history.shift();

      const barWidth = width / BARS;
      const centre = height / 2;

      for (let index = 0; index < history.length; index += 1) {
        const level = history[index];
        const barHeight = Math.max(2, level * (height - 6));
        const x = index * barWidth;

        context.fillStyle =
          level > 0.02 ? `rgba(224, 164, 88, ${0.35 + level * 0.65})` : 'rgba(107, 114, 128, 0.28)';
        context.beginPath();
        context.roundRect(x + barWidth * 0.22, centre - barHeight / 2, barWidth * 0.56, barHeight, 999);
        context.fill();
      }

      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameRef.current);
  }, [active, energyRef]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
