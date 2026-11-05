import kernelUrl from './kernel.js?url';

type Point = [number, number];
type Camera = object;
type Sample = { u: number; v: number; nu: number; nv: number };
type Project = (x: number, y: number, z: number) => Point;
type Solid = { g: SVGGElement; sil: SVGPathElement; cr: SVGPathElement };
type Tween = object;

/** Only the unchanged Hairline engine's surface used by our handheld. */
export interface HairlineEngine {
  Cam(azimuth: number, elevation: number, scale: number): Camera;
  fit(camera: Camera, points: number[][], x: number, y: number): void;
  proj(camera: Camera): Project;
  facing(camera: Camera): (sample: Sample) => boolean;
  rings(
    ...args: [number, number, number, number, number, number]
  ): [Sample[], Sample[]];
  rrect(...args: [number, number, number, number, number, number]): Sample[];
  prism(
    project: Project,
    front: (sample: Sample) => boolean,
    ring: Sample[],
    inner: Sample[],
    bottom: number,
    top: number,
  ): { sil: string; crease: string };
  solid(parent: SVGElement): Solid;
  put(solid: Solid, paths: { sil: string; crease: string }): void;
  mk<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attributes: Record<string, string | number>,
    parent: SVGElement,
  ): SVGElementTagNameMap[K];
  poly(points: Point[]): string;
  ringAt(project: Project, ring: Sample[], height: number): Point[];
  seg(start: Point, end: Point): string;
  fillet(points: Point[], radii: number[]): Point[];
  tween(value: number): Tween;
  tset(tween: Tween, target: number, now: number, delay: number): void;
  tval(tween: Tween, now: number): number;
  tdone(tween: Tween, now: number): boolean;
  register(
    stage: HTMLElement,
    tick: (dt: number, now: number) => boolean,
  ): { wake(): void; unregister(): void };
  pointer(
    stage: HTMLElement,
    handlers: { move(point: Point): void; leave(): void },
  ): () => void;
  disposer(): { add(dispose: () => void): void; dispose(): void };
  unproj(camera: Camera, x: number, y: number, height: number): Point;
  clamp(value: number, min: number, max: number): number;
  setReducedMotion(on: boolean): void;
  tour(stage: HTMLElement, stops: (Point | null)[]): { stop(): void };
}

let pending: Promise<HairlineEngine> | undefined;

/** Fetch the standalone engine only when an empty library actually mounts. */
export function loadHairline(): Promise<HairlineEngine> {
  if (pending) return pending;
  pending = new Promise<HairlineEngine>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = kernelUrl;
    script.async = true;
    script.onload = () => {
      const engine = (window as Window & { HL?: HairlineEngine }).HL;
      if (engine) resolve(engine);
      else reject(new Error('The handheld illustration could not initialize.'));
    };
    script.onerror = () =>
      reject(new Error('The handheld illustration could not load.'));
    document.head.append(script);
  }).catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
