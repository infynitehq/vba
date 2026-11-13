export type FileKind = 'rom' | 'cheats' | 'battery' | 'state';
export type FileContent = Blob | Uint8Array | ArrayBuffer;

export interface FilePlatform {
  pickFile(kind: FileKind): Promise<File | null>;
  saveFile(content: FileContent, name: string): Promise<boolean>;
  openExternal(url: string): Promise<void>;
}

export const isDesktop = import.meta.env.MODE === 'desktop';

async function adapter(): Promise<FilePlatform> {
  return isDesktop ? import('./native') : import('./browser');
}

export async function pickFile(kind: FileKind): Promise<File | null> {
  return (await adapter()).pickFile(kind);
}

export async function saveFile(
  content: FileContent,
  name: string,
): Promise<boolean> {
  return (await adapter()).saveFile(content, name);
}

export async function openExternal(url: string): Promise<void> {
  return (await adapter()).openExternal(url);
}
