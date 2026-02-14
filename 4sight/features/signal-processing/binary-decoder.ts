/**
 * Binary Decoder
 *
 * Decodes Bangle.js 2 binary sensor data from 4sight firmware.
 *
 * Binary formats (little-endian):
 *   PPG:   repeating 54-byte frames  [uint32 syncTimeMs][uint16 × 25 samples]
 *   Accel: repeating 154-byte frames [uint32 syncTimeMs][int16 x,y,z × 25 samples] (Q13: g × 8192)
 */

const PPG_FRAME_SIZE = 54; // 4 + 25*2
const PPG_SAMPLES_PER_FRAME = 25;

const ACCEL_FRAME_SIZE = 154; // 4 + 25*3*2
const ACCEL_SAMPLES_PER_FRAME = 25;
const ACCEL_Q13_SCALE = 8192;

// ============================================================================
// TYPES
// ============================================================================

export interface DecodedPPG {
  timestamps: number[];
  samples: number[];
}

export interface DecodedAccel {
  timestamps: number[];
  x: number[];
  y: number[];
  z: number[];
}

// ============================================================================
// PPG DECODING
// ============================================================================

/**
 * Decode PPG binary data.
 *
 * Frame format (54 bytes):
 * - 4 bytes: uint32 syncTimeMs (little-endian)
 * - 50 bytes: 25 × uint16 PPG samples (little-endian)
 */
export function decodePPG(data: Uint8Array): DecodedPPG {
  const timestamps: number[] = [];
  const samples: number[] = [];

  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  while (offset + PPG_FRAME_SIZE <= data.length) {
    const syncTime = dataView.getUint32(offset, true);
    offset += 4;

    for (let i = 0; i < PPG_SAMPLES_PER_FRAME; i++) {
      samples.push(dataView.getUint16(offset, true));
      offset += 2;
    }

    // All samples in this frame share the same sync timestamp
    for (let i = 0; i < PPG_SAMPLES_PER_FRAME; i++) {
      timestamps.push(syncTime);
    }
  }

  return { timestamps, samples };
}

// ============================================================================
// ACCELEROMETER DECODING
// ============================================================================

/**
 * Decode accelerometer binary data.
 *
 * Frame format (154 bytes):
 * - 4 bytes: uint32 syncTimeMs (little-endian)
 * - 150 bytes: 25 × (int16 x, int16 y, int16 z) samples (little-endian)
 *
 * Values are Q13 fixed-point (raw / 8192 = g-units).
 */
export function decodeAccel(data: Uint8Array): DecodedAccel {
  const timestamps: number[] = [];
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];

  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  while (offset + ACCEL_FRAME_SIZE <= data.length) {
    const syncTime = dataView.getUint32(offset, true);
    offset += 4;

    for (let i = 0; i < ACCEL_SAMPLES_PER_FRAME; i++) {
      const rawX = dataView.getInt16(offset, true);
      offset += 2;
      const rawY = dataView.getInt16(offset, true);
      offset += 2;
      const rawZ = dataView.getInt16(offset, true);
      offset += 2;

      timestamps.push(syncTime);
      x.push(rawX / ACCEL_Q13_SCALE);
      y.push(rawY / ACCEL_Q13_SCALE);
      z.push(rawZ / ACCEL_Q13_SCALE);
    }
  }

  return { timestamps, x, y, z };
}

// ============================================================================
// BLE WINDOW DATA DECODING
// ============================================================================

/**
 * Decode a combined BLE window payload (ppg bytes + accel bytes concatenated).
 *
 * The firmware sends a JSON header with ppgLen/accelLen, then the raw bytes.
 * This function splits and decodes both halves.
 */
export function decodeWindowPayload(
  data: Uint8Array,
  ppgLen: number,
  accelLen: number,
): { ppg: DecodedPPG; accel: DecodedAccel } {
  const ppgData = new Uint8Array(data.buffer, data.byteOffset, ppgLen);
  const accelData = new Uint8Array(data.buffer, data.byteOffset + ppgLen, accelLen);

  return {
    ppg: decodePPG(ppgData),
    accel: decodeAccel(accelData),
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

export function isValidPPGData(data: Uint8Array): boolean {
  return data.length > 0 && data.length % PPG_FRAME_SIZE === 0;
}

export function isValidAccelData(data: Uint8Array): boolean {
  return data.length > 0 && data.length % ACCEL_FRAME_SIZE === 0;
}

export function expectedPPGSampleCount(data: Uint8Array): number {
  return Math.floor(data.length / PPG_FRAME_SIZE) * PPG_SAMPLES_PER_FRAME;
}

export function expectedAccelSampleCount(data: Uint8Array): number {
  return Math.floor(data.length / ACCEL_FRAME_SIZE) * ACCEL_SAMPLES_PER_FRAME;
}
