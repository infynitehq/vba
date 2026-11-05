import { unzip } from 'fflate';

export const MAX_ROM_BYTES = 64 * 1024 * 1024;
export async function readGameFile(
  file: File,
): Promise<{ filename: string; buffer: ArrayBuffer }> {
  if (file.size > MAX_ROM_BYTES)
    throw new Error('Choose a file smaller than 64 MB.');
  if (/\.gba$/i.test(file.name))
    return { filename: file.name, buffer: await file.arrayBuffer() };
  if (!/\.zip$/i.test(file.name))
    throw new Error(
      'Unsupported file type. Choose your own .gba file, or a .zip containing one .gba file.',
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) => {
      unzip(
        bytes,
        {
          filter: (entry) => {
            if (
              /\.gba$/i.test(entry.name) &&
              entry.originalSize > MAX_ROM_BYTES
            )
              throw new Error('The game inside this zip exceeds 64 MB.');
            return (
              /\.gba$/i.test(entry.name) && !entry.name.startsWith('__MACOSX/')
            );
          },
        },
        (error, result) =>
          error
            ? reject(
                new Error(
                  'This zip could not be read. Try extracting it first.',
                ),
              )
            : resolve(result),
      );
    },
  );
  const entries = Object.entries(files);
  if (entries.length !== 1)
    throw new Error(
      'The zip must contain exactly one .gba game. Extract it and choose a single game.',
    );
  const [filename, data] = entries[0];
  return {
    filename: filename.split('/').pop()!,
    buffer: new Uint8Array(data).buffer,
  };
}
