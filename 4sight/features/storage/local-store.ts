import { File, Directory, Paths } from 'expo-file-system';
import type { BiosignalFeatures } from '@/features/feature-extraction/types';

const DATA_DIR = new Directory(Paths.document, '4sight-data');
const WINDOWS_DIR = new Directory(DATA_DIR, 'windows');
const MANIFEST_FILE = new File(DATA_DIR, 'manifest.json');

export interface WindowRecord {
  windowId: string;
  downloadedAt: number;
  ppgBytes: number;
  accelBytes: number;
  hasFeatures: boolean;
  uploadConfirmed: boolean;
}

let manifestCache: WindowRecord[] | null = null;

function readManifest(): WindowRecord[] {
  if (manifestCache !== null) return manifestCache;
  try {
    if (MANIFEST_FILE.exists) {
      const content = MANIFEST_FILE.textSync();
      manifestCache = JSON.parse(content) as WindowRecord[];
    } else {
      manifestCache = [];
    }
  } catch {
    manifestCache = [];
  }
  return manifestCache;
}

function writeManifest(records: WindowRecord[]): void {
  manifestCache = records;
  MANIFEST_FILE.write(JSON.stringify(records));
}

export function initialize(): void {
  if (!DATA_DIR.exists) {
    DATA_DIR.create({ intermediates: true });
  }
  if (!WINDOWS_DIR.exists) {
    WINDOWS_DIR.create({ intermediates: true });
  }
  readManifest();
}

export function saveWindow(
  windowId: string,
  ppgData: Uint8Array,
  accelData: Uint8Array,
  features: BiosignalFeatures | null,
): void {
  const windowDir = new Directory(WINDOWS_DIR, windowId);
  if (!windowDir.exists) {
    windowDir.create({ intermediates: true });
  }

  const ppgFile = new File(windowDir, 'ppg.bin');
  ppgFile.write(ppgData);

  const accelFile = new File(windowDir, 'accel.bin');
  accelFile.write(accelData);

  if (features) {
    const featuresFile = new File(windowDir, 'features.json');
    featuresFile.write(JSON.stringify(features));
  }

  const manifest = readManifest();
  manifest.push({
    windowId,
    downloadedAt: Date.now(),
    ppgBytes: ppgData.length,
    accelBytes: accelData.length,
    hasFeatures: features !== null,
    uploadConfirmed: false,
  });
  writeManifest(manifest);
}

export function hasWindow(windowId: string): boolean {
  const manifest = readManifest();
  return manifest.some((r) => r.windowId === windowId);
}

export function getManifest(): WindowRecord[] {
  return readManifest();
}

export function getWindowFeatures(
  windowId: string,
): BiosignalFeatures | null {
  try {
    const featuresFile = new File(WINDOWS_DIR, windowId, 'features.json');
    if (!featuresFile.exists) return null;
    const content = featuresFile.textSync();
    return JSON.parse(content) as BiosignalFeatures;
  } catch {
    return null;
  }
}

export function getWindowPPGBinary(windowId: string): Uint8Array | null {
  try {
    const ppgFile = new File(WINDOWS_DIR, windowId, 'ppg.bin');
    if (!ppgFile.exists) return null;
    return ppgFile.bytesSync();
  } catch {
    return null;
  }
}

export function markUploadConfirmed(windowId: string): void {
  const manifest = readManifest();
  const record = manifest.find((r) => r.windowId === windowId);
  if (record) {
    record.uploadConfirmed = true;
    writeManifest(manifest);
  }
}
