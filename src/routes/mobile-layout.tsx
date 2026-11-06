import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { PlayerLayout } from '../components/PlayerLayout';
import { Icon } from '../components/Icon';
import { textButton } from '../components/ui';
import { Button } from '../components/ui/button';

export const Route = createFileRoute('/mobile-layout')({
  component: MobileLayout,
});

function MobileLayout() {
  const navigate = Route.useNavigate();
  const [revision, setRevision] = useState(0);
  return (
    <PlayerLayout
      title="Mobile layout"
      eyebrow="Layout preview"
      onLibrary={() => void navigate({ to: '/' })}
      action={
        <Button
          className={`${textButton} text-[#eeeae3] hover:bg-[#22201d] hover:text-white`}
          onClick={() => setRevision((value) => value + 1)}
        >
          <Icon name="retry" size={16} />
          Reset
        </Button>
      }
    >
      <iframe
        key={revision}
        title="Mobile controls preview"
        src={`${import.meta.env.BASE_URL}player-preview.html`}
        allow="fullscreen"
        className="mobile-layout-frame min-h-0 w-full flex-1 border-0"
      />
    </PlayerLayout>
  );
}
