import { Icon } from './Icon';
import { DeveloperPortrait } from './DeveloperPortrait';

const link =
  'inline-flex min-h-11 items-center gap-2 text-xs text-muted underline decoration-line underline-offset-4 hover:text-ink';

export function About() {
  return (
    <section
      aria-label="About Pocket GBA"
      className="mt-10 border-t border-line pt-7"
    >
      <div className="flex items-center justify-between gap-4 text-[11px] text-muted">
        <p className="uppercase tracking-widest">About Pocket GBA</p>
        <span>v0.1.0</span>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            For the games
            <br />
            <span className="text-muted">you never outgrew.</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-muted">
            Your GBA games. Your saves. Always in your pocket.
            <br className="hidden sm:block" /> No accounts, no uploads—just
            press play.
          </p>
        </div>
        <DeveloperPortrait />
      </div>

      <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center gap-3">
          <p className="text-xs leading-6 text-muted">
            Built by <span className="font-medium text-ink">Soham Datta</span>{' '}
            at infynite.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5">
          <a
            className={link}
            href="https://github.com/infynitehq/vba"
            target="_blank"
            rel="noreferrer"
          >
            Source code <Icon name="arrow" size={14} />
          </a>
          <a className={link} href="mailto:dattasoham805@gmail.com">
            Say hello <Icon name="arrow" size={14} />
          </a>
        </div>
      </div>

      <div className="mt-5 space-y-1 text-[10px] leading-relaxed text-muted">
        <p>Powered by EmulatorJS 4.2.3 / mGBA.</p>
        <p>Bring your own games. No ROMs or BIOS included.</p>
      </div>
    </section>
  );
}
