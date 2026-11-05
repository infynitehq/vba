import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { Icon } from './Icon';
import { Button } from './ui/button';
import { ErrorIllustration } from './ErrorIllustration';
import '../styles/error.css';

function ErrorDetails({ error }: { error: unknown }) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const message =
    error instanceof Error
      ? import.meta.env.DEV
        ? error.stack || error.message
        : error.message
      : 'An unexpected error occurred.';

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  return (
    <details className="error-details">
      <summary>
        <span>Technical details</span>
        <span className="error-details-toggle" aria-hidden="true">
          +
        </span>
      </summary>
      <Button
        type="button"
        size="icon-xs"
        className="error-details-copy text-ink"
        aria-label="Copy technical details"
        onClick={() => void copyMessage()}
      >
        <Icon name={copyStatus === 'copied' ? 'check' : 'copy'} size={15} />
      </Button>
      <span
        role="status"
        className={copyStatus === 'copied' ? 'sr-only' : 'error-copy-status'}
      >
        {copyStatus === 'copied'
          ? 'Copied to clipboard.'
          : copyStatus === 'failed'
            ? 'Couldn’t copy. Select and copy the message.'
            : ''}
      </span>
      <div className="error-message">
        <pre>{message}</pre>
      </div>
    </details>
  );
}

/** Deliberately independent of router/provider context so the outer boundary works too. */
export function ErrorPage({
  error,
  onRetry,
  notFound = false,
}: {
  error?: unknown;
  onRetry?: () => void;
  notFound?: boolean;
}) {
  return (
    <div className="error-page">
      <main className="error-main">
        <section aria-labelledby="error-title" className="error-content">
          <ErrorIllustration />
          <div>
            <p className="error-status">
              <span />
              {notFound ? 'Off the map · 404' : 'A small interruption'}
            </p>
            <h1 id="error-title" className="error-title">
              {notFound
                ? 'This level doesn’t exist.'
                : 'Let’s get you back in the game.'}
            </h1>
            <p className="error-description">
              {notFound
                ? 'There’s no page at this address. Head back to your library to find your next adventure.'
                : 'This screen didn’t load quite right. Give it another try, or head back to your library.'}
            </p>
            <div className="error-actions">
              {!notFound && (
                <Button
                  type="button"
                  variant="default"
                  className="error-action error-action-primary"
                  onClick={onRetry ?? (() => window.location.reload())}
                >
                  <Icon name="retry" size={16} />
                  Try again
                </Button>
              )}
              <a
                href={import.meta.env.BASE_URL}
                className={`error-action ${notFound ? 'error-action-primary' : 'error-action-secondary'}`}
              >
                <Icon name="back" size={16} />
                Back to library
              </a>
            </div>
          </div>
          {!notFound && error !== undefined && <ErrorDetails error={error} />}
        </section>
      </main>
    </div>
  );
}

export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <ErrorPage
      error={error}
      onRetry={() => {
        void router.invalidate();
      }}
    />
  );
}

export function NotFoundPage() {
  return <ErrorPage notFound />;
}

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; error?: unknown }
> {
  state: { failed: boolean; error?: unknown } = { failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      'Pocket GBA encountered an unexpected error',
      error,
      info.componentStack,
    );
  }

  render() {
    return this.state.failed ? (
      <ErrorPage error={this.state.error} />
    ) : (
      this.props.children
    );
  }
}
