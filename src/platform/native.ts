import { invoke } from '@tauri-apps/api/core';
import type { FileContent, FileKind } from './index';

export async function openExternal(url: string): Promise<void> {
  await invoke<void>('open_external', { url });
}

export async function pickFile(kind: FileKind): Promise<File | null> {
  const selected = await invoke<{ name: string; bytes: number[] } | null>(
    'import_file',
    { kind },
  );
  if (!selected) return null;
  return new File([new Uint8Array(selected.bytes)], selected.name);
}

export async function saveFile(
  content: FileContent,
  name: string,
): Promise<boolean> {
  const bytes =
    content instanceof Blob
      ? new Uint8Array(await content.arrayBuffer())
      : content instanceof Uint8Array
        ? content
        : new Uint8Array(content);
  return invoke<boolean>('export_file', { name, bytes: Array.from(bytes) });
}
