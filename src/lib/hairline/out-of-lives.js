/* A quiet handheld: its exhausted display gives the bright stroke to restart. */
/* global HL, hairline */

export function mount({ stage, svg, read, engine = HL }, value) {
  const {
    Cam, facing, fit, proj, rings, rrect, prism, solid, put, mk, poly,
    ringAt, seg, fillet, tween, tset, tval, tdone, pointer, register, disposer,
  } = engine;
  const bag = disposer();
  let depth = value;
  const C = Cam(45, 0.5, 1.9);
  // The console rests on its heel, rather than lying flat on the desk.
  const world = (x, y, z) => [x, y * .64 + z * .768, (140 - y) * .768 + z * .64];
  fit(C, [[0, 0, 0], [88, 0, 10], [0, 140, 0], [88, 140, 10]].map(p => world(...p)), 200, 166);
  const camera = proj(C);
  const P = (x, y, z) => camera(...world(x, y, z));
  const front = facing(C);
  const g = mk('g', {}, svg);
  const body = solid(g);
  const [shell, seam] = rings(0, 0, 88, 140, 10, 1.3);
  put(body, prism(P, front, shell, seam, 0, 9));

  const bezel = solid(g);
  const [bezelRing, bezelInner] = rings(9, 12, 79, 83, 5, 1.2);
  put(bezel, prism(P, front, bezelRing, bezelInner, 9, 10));
  mk('path', { d: poly(ringAt(P, rrect(15, 18, 73, 74, 3, 8), 10.2)), class: 'lo' }, g);

  // A face made of display segments, not typography or a stamped icon.
  const face = mk('path', { class: 'nf hi' }, g);
  const cross = (x, y) => seg(P(x - 4, y - 4, 10.4), P(x + 4, y + 4, 10.4))
    + seg(P(x + 4, y - 4, 10.4), P(x - 4, y + 4, 10.4));
  face.setAttribute('d', cross(30, 37) + cross(58, 37)
    + seg(P(32, 58, 10.4), P(56, 58, 10.4)));

  const crossPoints = [[23, 96], [31, 96], [31, 104], [39, 104],
    [39, 112], [31, 112], [31, 120], [23, 120], [23, 112],
    [15, 112], [15, 104], [23, 104]];
  const dpad = fillet(crossPoints, crossPoints.map(() => 1), 4);
  mk('path', { d: poly(dpad.map(([x, y]) => P(x, y, 11))), class: 'sil' }, g);
  mk('path', { d: seg(P(25, 108, 11.2), P(29, 108, 11.2)), class: 'nf lo' }, g);

  const controls = [
    { x: 68, y: 101, radius: 8, name: 'restart' },
    { x: 52, y: 116, radius: 6, name: 'select' },
  ].map(part => {
    const socket = mk('path', {
      d: poly(ringAt(P, rrect(part.x - part.radius - 1.5, part.y - part.radius - 1.5,
        part.x + part.radius + 1.5, part.y + part.radius + 1.5, part.radius + 1.5, 12), 9.1)),
      class: 'lo',
    }, g);
    const [ring, inner] = rings(part.x - part.radius, part.y - part.radius,
      part.x + part.radius, part.y + part.radius, part.radius, .8);
    return { ...part, socket, ring, inner, el: solid(g), motion: tween(0), last: null };
  });
  for (let i = 0; i < 3; i++) {
    mk('path', { d: seg(P(65 + i * 4, 127, 9.2), P(65 + i * 4, 133, 9.2)), class: 'nf lo' }, g);
  }

  let active = -1;
  function draw(now) {
    let moving = false;
    for (const part of controls) {
      const depression = tval(part.motion, now);
      if (depression !== part.last) {
        put(part.el, prism(P, front, part.ring, part.inner, 9.2, 14 - depression));
        part.last = depression;
      }
      if (!tdone(part.motion, now)) moving = true;
    }
    return moving;
  }
  const loop = register(stage, (_dt, now) => draw(now));
  bag.add(loop.unregister);

  // Invert the fixed face plane, not the animated button positions.
  const origin = P(0, 0, 14), px = P(1, 0, 14), py = P(0, 1, 14);
  const ax = px[0] - origin[0], ay = px[1] - origin[1];
  const bx = py[0] - origin[0], by = py[1] - origin[1];
  const det = ax * by - ay * bx;
  function hit([sx, sy]) {
    const dx = sx - origin[0], dy = sy - origin[1];
    const x = (dx * by - dy * bx) / det;
    const y = (ax * dy - ay * dx) / det;
    return controls.findIndex(part => Math.hypot(x - part.x, y - part.y) <= part.radius + 5);
  }
  function choose(next) {
    if (next === active) return;
    active = next;
    const now = performance.now();
    controls.forEach((part, i) => {
      const pressure = next < 0 ? 0 : i === next ? depth : depth * .22;
      tset(part.motion, pressure, now, next < 0 ? 0 : Math.abs(i - next) * 40);
      part.el.sil.classList.toggle('hi', i === next);
    });
    face.classList.toggle('hi', next < 0);
    read.textContent = next < 0 ? 'rest' : controls[next].name;
    loop.wake();
  }
  draw(performance.now());
  read.textContent = 'rest';
  bag.add(pointer(stage, { move: p => choose(hit(p)), leave: () => choose(-1) }));
  bag.add(() => svg.replaceChildren());
  return {
    set(v) {
      depth = v;
      if (active >= 0) { const selected = active; active = -1; choose(selected); }
    },
    destroy: bag.dispose,
  };
}

if (typeof hairline === 'function') hairline({
  name: 'out-of-lives',
  means: 'An exhausted handheld with crossed-out eyes; hover its restart button to gently press it back into the casing.',
  rules: [1, 4, 5, 7, 8, 9],
  range: [1, 2.5, 4],
  tour: [[216, 121], [196, 230], [162, 245], null],
  mount,
});
