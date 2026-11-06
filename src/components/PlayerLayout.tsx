import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { textButton } from './ui';
import { Button } from './ui/button';
import '../styles/player.css';

export function PlayerLayout({
  title,
  eyebrow = 'Now playing',
  onLibrary,
  action,
  children,
}: {
  title: string;
  eyebrow?: string;
  onLibrary(): void;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="player-shell fixed inset-0 flex flex-col bg-[#191715] pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-[#eeeae3]">
      <div className="player-header flex min-h-16 shrink-0 items-center justify-between gap-1 px-2 sm:gap-3">
        <Button
          className={`${textButton} text-[#eeeae3] hover:bg-[#22201d] hover:text-white`}
          onClick={onLibrary}
        >
          <Icon name="back" size={16} />
          <span>Library</span>
        </Button>
        <div className="player-title min-w-0 text-center">
          <span className="player-eyebrow">{eyebrow}</span>
          <span className="block truncate text-xs text-[#a9a39b]">{title}</span>
        </div>
        {action}
      </div>
      {children}
    </main>
  );
}
