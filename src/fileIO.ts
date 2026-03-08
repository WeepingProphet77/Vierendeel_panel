import type { AppInputs, Member, SavedPrestressDesign } from './types';

const FILE_VERSION = 1;
const FILE_EXTENSION = '.vfa';

interface VfaFile {
  version: number;
  inputs: AppInputs;
  prestressDesigns: Record<number, SavedPrestressDesign>;
  memberOverrides: { id: number; thicknessIn: number }[] | null;
}

export function serializeProject(
  inputs: AppInputs,
  prestressDesigns: Record<number, SavedPrestressDesign>,
  members: Member[] | undefined,
): string {
  const data: VfaFile = {
    version: FILE_VERSION,
    inputs,
    prestressDesigns,
    memberOverrides: members
      ? members.filter(m => m.thicknessOverridden).map(m => ({ id: m.id, thicknessIn: m.thicknessIn }))
      : null,
  };
  return JSON.stringify(data, null, 2);
}

export function deserializeProject(json: string): {
  inputs: AppInputs;
  prestressDesigns: Record<number, SavedPrestressDesign>;
  memberOverrides: { id: number; thicknessIn: number }[] | null;
} {
  const data = JSON.parse(json) as VfaFile;
  if (!data.version || !data.inputs) {
    throw new Error('Invalid .vfa file format');
  }
  return {
    inputs: data.inputs,
    prestressDesigns: data.prestressDesigns ?? {},
    memberOverrides: data.memberOverrides ?? null,
  };
}

export async function saveFile(content: string, defaultName: string): Promise<void> {
  // Try the modern File System Access API (Chrome/Edge)
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: defaultName + FILE_EXTENSION,
        types: [
          {
            description: 'Vierendeel Frame Analyzer File',
            accept: { 'application/json': [FILE_EXTENSION] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    } catch (err: any) {
      if (err.name === 'AbortError') return; // user cancelled
      // fall through to legacy approach
    }
  }

  // Fallback: create a download link
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName + FILE_EXTENSION;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function loadFile(): Promise<string | null> {
  // Try the modern File System Access API
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: 'Vierendeel Frame Analyzer File',
            accept: { 'application/json': [FILE_EXTENSION] },
          },
        ],
        multiple: false,
      });
      const file = await handle.getFile();
      return await file.text();
    } catch (err: any) {
      if (err.name === 'AbortError') return null; // user cancelled
      // fall through to legacy approach
    }
  }

  // Fallback: hidden file input
  return new Promise<string | null>(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = FILE_EXTENSION;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      resolve(await file.text());
    };
    // Handle cancel (input won't fire change)
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
