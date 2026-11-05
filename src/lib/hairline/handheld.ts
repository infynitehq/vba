/* A quiet handheld with an open cartridge bay and gently pressing controls. */
import type { HairlineEngine } from './engine';

export const handheldTour: ([number, number] | null)[] = [
  [113, 148],
  [163, 177],
  [204, 181],
  null,
];

export function mountHandheld(
  engine: HairlineEngine,
  { stage, svg }: { stage: HTMLElement; svg: SVGSVGElement },
) {
  const {
    Cam,
    fit,
    proj,
    facing,
    rings,
    rrect,
    prism,
    solid,
    put,
    mk,
    poly,
    ringAt,
    seg,
    fillet,
    tween,
    tset,
    tval,
    tdone,
    register,
    pointer,
    disposer,
    unproj,
    clamp,
  } = engine;

  const bag = disposer();
  let active = 'rest';
  const depth = (v: number) => clamp(v * 0.7, 0, 1);
  const C = Cam(45, 0.5, 2.55);
  fit(
    C,
    [
      [0, 0, 0],
      [78, 124, 0],
      [78, 0, 30],
      [0, 124, 12],
    ],
    200,
    166,
  );
  const P = proj(C),
    front = facing(C);
  const g = mk('g', {}, svg);
  const body = solid(g);
  const [shell, seam] = rings(0, 0, 78, 124, 8, 1.4);
  put(body, prism(P, front, shell, seam, 0, 12));

  // A recessed cartridge bay: its near lip hides the connector ends.
  const outline = (ring: ReturnType<typeof rrect>, z: number, cls: string) =>
    mk(
      'path',
      {
        d: poly(ringAt(P, ring, z)),
        class: cls,
      },
      g,
    );
  const slot = outline(rrect(14, 5, 64, 18, 3, 6), 12.1, 'sil hi');
  outline(rrect(17, 7, 61, 15, 2, 6), 12.2, 'lo');
  mk(
    'path',
    {
      d: [25, 32, 39, 46, 53]
        .map((x) => seg(P(x, 10, 12.3), P(x, 14, 12.3)))
        .join(''),
      class: 'nf lo',
    },
    g,
  );

  // A broad bezel and blank recessed display identify the handheld at thumbnail size.
  outline(rrect(9, 25, 69, 73, 5, 8), 12.1, 'sil');
  outline(rrect(16, 32, 62, 64, 2, 6), 12.2, 'lo');

  const plus: [number, number][] = [
    [19, 83],
    [26, 83],
    [26, 90],
    [33, 90],
    [33, 97],
    [26, 97],
    [26, 104],
    [19, 104],
    [19, 97],
    [12, 97],
    [12, 90],
    [19, 90],
  ];
  const cross = fillet(
    plus,
    plus.map(() => 1.1),
  );
  const controls: {
    name: string;
    x: number;
    y: number;
    radius: number;
    el: SVGPathElement;
    press: ReturnType<typeof tween>;
    last: number;
    draw(v: number): void;
  }[] = [];
  const dpad = mk('path', { class: 'sil' }, g);
  controls.push({
    name: 'd-pad',
    x: 22.5,
    y: 93.5,
    radius: 14,
    el: dpad,
    press: tween(0),
    last: -1,
    draw: (v) =>
      dpad.setAttribute(
        'd',
        poly(cross.map(([x, y]) => P(x, y, 14 - depth(v) * 1.6))),
      ),
  });
  for (const [name, x, y] of [
    ['button b', 53, 97],
    ['button a', 65, 88],
  ] as const) {
    const [ring, inner] = rings(x - 4, y - 4, x + 4, y + 4, 4, 0.7);
    const button = solid(g);
    controls.push({
      name,
      x,
      y,
      radius: 8,
      el: button.sil,
      press: tween(0),
      last: -1,
      draw: (v) =>
        put(button, prism(P, front, ring, inner, 12.1, 15 - depth(v) * 2.6)),
    });
  }
  for (const [name, x] of [
    ['select', 29],
    ['start', 42],
  ] as const) {
    const ring = rrect(x, 111, x + 9, 114, 1.4, 5);
    const button = outline(ring, 13, 'sil');
    controls.push({
      name,
      x: x + 4.5,
      y: 112.5,
      radius: 6,
      el: button,
      press: tween(0),
      last: -1,
      draw: (v) =>
        button.setAttribute('d', poly(ringAt(P, ring, 13 - depth(v) * 0.8))),
    });
  }
  for (const control of controls) control.draw(0);

  const loop = register(stage, (_dt, now) => {
    let moving = false;
    for (const control of controls) {
      const v = tval(control.press, now);
      if (Math.abs(v - control.last) > 0.0001) {
        control.draw(v);
        control.last = v;
      }
      if (!tdone(control.press, now)) moving = true;
    }
    return moving;
  });
  bag.add(loop.unregister);
  function choose(name: string) {
    if (name === active) return;
    active = name;
    const now = performance.now();
    slot.classList.toggle('hi', name === 'rest');
    for (const control of controls) {
      const on = control.name === name;
      tset(control.press, on ? 1 : 0, now, 0);
      control.el.classList.toggle('hi', on);
    }
    loop.wake();
  }
  bag.add(
    pointer(stage, {
      move: ([sx, sy]) => {
        const [bx, by] = unproj(C, sx, sy, 14);
        const control = controls.find(
          (c) => Math.hypot(bx - c.x, by - c.y) <= c.radius,
        );
        choose(control ? control.name : 'rest');
      },
      leave: () => choose('rest'),
    }),
  );
  bag.add(() => svg.replaceChildren());
  return bag.dispose;
}
