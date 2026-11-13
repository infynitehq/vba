import { Icon } from './Icon';
import { DeveloperPortrait } from './DeveloperPortrait';
import { isDesktop, openExternal } from '../platform';
import { friendlyError } from '../data/db';
import { useToast } from './Toast';
import { useState, type MouseEvent } from 'react';

export function About() {
  const toast = useToast();
  const [sponsorHovered, setSponsorHovered] = useState(false);
  function openLink(event: MouseEvent<HTMLAnchorElement>) {
    if (!isDesktop) return;
    event.preventDefault();
    void openExternal(event.currentTarget.href).catch((error: unknown) =>
      toast(friendlyError(error)),
    );
  }
  return (
    <section
      aria-label="About Pocket GBA"
      className="mt-10 border-t border-line pt-7"
    >
      <div className="flex items-center justify-between gap-4 text-[11px] text-muted">
        <p className="uppercase tracking-widest">About Pocket GBA</p>
        <span>v{__APP_VERSION__}</span>
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
          <p className="mt-5 text-xs leading-6 text-muted">
            Built by{' '}
            <a
              className="rounded-sm font-medium text-ink decoration-primary underline-offset-4 hover:text-accent-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              href="mailto:dattasoham805@gmail.com"
              title="Say hi to Soham"
              onClick={openLink}
            >
              Soham Datta
            </a>{' '}
            at infynite.
          </p>
        </div>
        <div className="flex w-24 flex-col items-center gap-3 sm:w-36 sm:justify-self-end">
          <DeveloperPortrait sponsorHovered={sponsorHovered} />
          <a
            className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-sm border border-line px-1.5 py-1.5 text-xs font-medium text-accent-foreground hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            href="https://github.com/sponsors/tech-savvy-guy"
            target="_blank"
            rel="noreferrer"
            aria-label="Sponsor my work on GitHub"
            onPointerEnter={(event) => {
              if (event.pointerType !== 'touch') setSponsorHovered(true);
            }}
            onPointerLeave={() => setSponsorHovered(false)}
            onPointerCancel={() => setSponsorHovered(false)}
            onClick={openLink}
          >
            <Icon name="heart" size={14} /> Sponsor my work
          </a>
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-[10px] leading-relaxed text-muted">
        <div className="space-y-1">
          <p>Powered by EmulatorJS 4.2.3 / mGBA.</p>
          <p>Bring your own games. No ROMs or BIOS included.</p>
        </div>
        <a
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-sm underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          href="https://github.com/infynitehq/vba"
          target="_blank"
          rel="noreferrer"
          onClick={openLink}
        >
          <Icon name="github" size={13} /> Source code
        </a>
      </div>
    </section>
  );
}
