import { useEffect, useRef } from 'react';
import { mount } from '../lib/hairline/out-of-lives.js';
import { loadHairline } from '../lib/hairline/engine';
import '../styles/handheld.css';

/** Decorative only; recovery stays available even if the engine cannot load. */
export function ErrorIllustration() {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const stage = stageRef.current!;
    const svg = svgRef.current!;
    void loadHairline()
      .then((engine) => {
        if (disposed) return;
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const updateMotion = () => engine.setReducedMotion(motion.matches);
        updateMotion();
        const figure = mount(
          { stage, svg, read: { textContent: 'rest' }, engine },
          2.5,
        );
        motion.addEventListener('change', updateMotion);
        cleanup = () => {
          motion.removeEventListener('change', updateMotion);
          figure.destroy();
        };
      })
      .catch(() => {
        // A decorative failure must never take down the recovery screen.
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className="error-illustration handheld-illustration"
      aria-hidden="true"
    >
      <svg ref={svgRef} viewBox="0 0 400 320" focusable="false">
        <g className="handheld-fallback">
          <rect x="147" y="68" width="106" height="184" rx="14" />
          <rect x="160" y="84" width="80" height="79" rx="6" />
          <path d="m175 105 10 10m0-10-10 10m40-10 10 10m0-10-10 10m-34 25h28M164 204h24m-12-12v24m43-18h1m15-10h1" />
        </g>
      </svg>
    </div>
  );
}
