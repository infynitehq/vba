import type { HairlineEngine } from './engine';

export function mount(
  host: {
    stage: HTMLElement;
    svg: SVGSVGElement;
    read: { textContent: string | null };
    engine: HairlineEngine;
  },
  value: number,
): { set(value: number): void; destroy(): void };
