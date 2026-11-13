import type { FileContent, FileKind } from './index';

export async function openExternal(url: string): Promise<void> {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function pickFile(kind: FileKind): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    // Keep ROM selection unrestricted for iOS; validation happens after import.
    if (kind === 'cheats') input.accept = '.json,application/json';
    const finish = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), {
      once: true,
    });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

export async function saveFile(
  content: FileContent,
  name: string,
): Promise<boolean> {
  const blob =
    content instanceof Blob
      ? content
      : new Blob([
          content instanceof Uint8Array ? new Uint8Array(content) : content,
        ]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
