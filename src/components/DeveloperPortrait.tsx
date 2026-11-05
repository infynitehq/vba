import { useState, type CSSProperties } from 'react';
import '../styles/portrait.css';

const columns = 16;
const waveDelay = 480;
const tiles = Array.from({ length: columns * columns }, (_, index) => ({
  x: index % columns,
  y: Math.floor(index / columns),
}));

export function DeveloperPortrait() {
  const base = import.meta.env.BASE_URL;
  const [original, setOriginal] = useState(false);
  const toggleOriginal = () => {
    setOriginal((value) => !value);
  };
  return (
    <button
      type="button"
      aria-label="Toggle original portrait of Soham Datta"
      aria-pressed={original}
      title="Double-click to toggle the original photo"
      data-original={original ? '' : undefined}
      onDoubleClick={toggleOriginal}
      onClick={(event) => {
        // Native keyboard activation has no click count. Mouse uses double-click.
        if (event.detail === 0) toggleOriginal();
      }}
      className="developer-portrait size-24 rounded-md sm:size-36 sm:justify-self-end"
      onPointerEnter={(event) => {
        if (event.pointerType === 'touch') return;
        const portrait = event.currentTarget;
        const bounds = portrait.getBoundingClientRect();
        // An inward-facing wavefront, aligned with the point of entry.
        let dx = 0.5 - (event.clientX - bounds.left) / bounds.width;
        let dy = 0.5 - (event.clientY - bounds.top) / bounds.height;
        if (Math.abs(dx) + Math.abs(dy) < 0.001) dx = dy = 1;
        const offsets = tiles.map(({ x, y }) => x * dx + y * dy);
        const first = Math.min(...offsets);
        const span = Math.max(...offsets) - first;
        portrait
          .querySelectorAll<HTMLElement>('.portrait-tile')
          .forEach((tile, index) => {
            const delay = Math.round(
              ((offsets[index] - first) / span) * waveDelay,
            );
            tile.style.setProperty('--tile-enter-delay', `${delay}ms`);
            tile.style.setProperty(
              '--tile-leave-delay',
              `${waveDelay - delay}ms`,
            );
          });
        portrait.dataset.revealing = '';
      }}
      onPointerLeave={(event) => {
        delete event.currentTarget.dataset.revealing;
      }}
      onPointerCancel={(event) => {
        delete event.currentTarget.dataset.revealing;
      }}
      style={
        {
          '--portrait-light-mask': `url("${base}photo-mask-light.png")`,
          '--portrait-dark-mask': `url("${base}photo-mask-dark.png")`,
          '--portrait-columns': columns,
        } as CSSProperties
      }
    >
      <span className="portrait-tiles" aria-hidden="true">
        {tiles.map(({ x, y }, index) => (
          <span
            key={index}
            className="portrait-tile"
            style={
              {
                left: `${(x / columns) * 100}%`,
                top: `${(y / columns) * 100}%`,
                backgroundImage: `url("${base}photo-color.webp")`,
                backgroundPosition: `${(x / (columns - 1)) * 100}% ${(y / (columns - 1)) * 100}%`,
                '--tile-enter-delay': `${(x + y) * 16}ms`,
                '--tile-leave-delay': `${((columns - 1) * 2 - x - y) * 16}ms`,
              } as CSSProperties
            }
          />
        ))}
      </span>
    </button>
  );
}
