import { useEffect, useRef } from 'react';
import { loadHairline } from '../lib/hairline/engine';
import { handheldTour, mountHandheld } from '../lib/hairline/handheld';
import '../styles/handheld.css';

/** Decorative: the heading and upload button provide the accessible content. */
export function EmptyLibraryIllustration() {
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
        engine.setReducedMotion(motion.matches);
        const destroy = mountHandheld(engine, { stage, svg });
        let tour: ReturnType<typeof engine.tour> | undefined;
        const updateMotion = () => {
          tour?.stop();
          engine.setReducedMotion(motion.matches);
          tour = motion.matches ? undefined : engine.tour(stage, handheldTour);
        };
        updateMotion();
        motion.addEventListener('change', updateMotion);
        cleanup = () => {
          motion.removeEventListener('change', updateMotion);
          tour?.stop();
          destroy();
        };
      })
      .catch(() => {
        // Illustration failures must never block importing or playing a game.
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div
      className="flex min-h-0 w-full flex-[0_1_24rem] items-center justify-center [container-type:size]"
      aria-hidden="true"
    >
      <div
        ref={stageRef}
        className="handheld-illustration aspect-5/4 w-[min(100cqw,125cqh,32rem)]"
        aria-hidden="true"
      >
        <svg
          ref={svgRef}
          viewBox="0 0 400 320"
          className="block w-full"
          focusable="false"
        >
          <g className="handheld-fallback">
            <rect x="147" y="83" width="106" height="164" rx="14" />
            <rect x="161" y="105" width="78" height="62" rx="6" />
            <path d="M166 197h26m-13-13v26m37-18h1m16-8h1" />
          </g>
        </svg>
      </div>
    </div>
  );
}
