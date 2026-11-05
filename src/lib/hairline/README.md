# Hairline handheld illustrations

`handheld.ts` is the approved empty-slot figure, adapted to the library's React lifecycle. Its open cartridge bay is static; the controls press on hover and during the automatic tour. `EmptyLibraryIllustration.tsx` disables the tour under reduced motion and tears it down on unmount.

`out-of-lives.js` is the error-page figure: a handheld with crossed-out eyes and a flat mouth. `ErrorIllustration.tsx` mounts this same source directly, without an iframe or standalone preview page. Hover presses a control and transfers the highlight from the face; there is no automatic tour on the recovery screen. Reduced motion is respected and the figure is destroyed on unmount. The adjacent declaration file types its React integration. The source retains its Hairline bench metadata so a standalone preview can be rebuilt when needed.

`kernel.js` is the **unchanged** Hairline kernel supplied by the `hairline-create` skill (`@lucasmarkes/hairline`, Lucas Markes). Its source hash is recorded on its first line. Keep this vendored engine untouched; change only the figure or its wrapper. `engine.ts` loads it as a local, fingerprinted Vite asset only when needed. No third-party requests or additional runtime packages are required.

The figure uses rules 1, 3, 5, 7, 8, 9, and 10: fixed hit areas, bounded movement, a composed rest pose, sleeping animation loops, eased discrete motion, rounded geometry, and no labels within the drawing. Button travel is intentionally small, like a real handheld.
