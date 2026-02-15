/**
 * Binary Decoder
 *
 * Decodes Bangle.js 2 binary sensor data formats.
 *
 * Ported from: MaonV3/Services/BinaryDecoder.swift
 */

import { PPGConfig, AccelConfig, TempConfig } from '../constants/sensor';
import type { DecodedPPG, DecodedAccel, DecodedTemp } from './types';

// ============================================================================
// PPG DECODING
// ============================================================================

/**
 * Decode PPG binary data.
 *
 * Frame format (54 bytes):
 * - 4 bytes: Little-endian uint32 timestamp (ms since epoch)
 * - 50 bytes: 25 × uint16 PPG samples (little-endian)
 *
 * @param data Raw binary data from ppg.bin
 * @returns Object with timestamps per sample and PPG sample values
 */
export function decodePPG(data: Uint8Array): DecodedPPG {
  const timestamps: number[] = [];
  const samples: number[] = [];

  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  while (offset + PPGConfig.FRAME_SIZE <= data.length) {
    // Read timestamp (4 bytes, little-endian uint32)
    const syncTime = dataView.getUint32(offset, true);
    offset += 4;

    // Read 25 PPG samples (each 2 bytes, little-endian uint16)
    for (let i = 0; i < PPGConfig.SAMPLES_PER_FRAME; i++) {
      const sample = dataView.getUint16(offset, true);
      offset += 2;

      timestamps.push(syncTime);
      samples.push(sample);
    }
  }

  return { timestamps, samples };
}

/**
 * Decode PPG to Double array for signal processing.
 */
export function decodePPGAsDouble(data: Uint8Array): { timestamps: number[]; samples: number[] } {
  return decodePPG(data);
}

// ============================================================================
// ACCELEROMETER DECODING
// ============================================================================

/**
 * Decode accelerometer binary data.
 *
 * Frame format (76 bytes):
 * - 4 bytes: Little-endian uint32 timestamp (ms since epoch)
 * - 72 bytes: 12 × (int16 x, int16 y, int16 z) samples (little-endian)
 *
 * Values are in Q13 fixed-point format. Divide by 8192 to get g-units.
 *
 * @param data Raw binary data from accel.bin
 * @returns Object with timestamps and x, y, z values in g-units
 */
export function decodeAccel(data: Uint8Array): DecodedAccel {
  const timestamps: number[] = [];
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];

  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  while (offset + AccelConfig.FRAME_SIZE <= data.length) {
    // Read timestamp (4 bytes, little-endian uint32)
    const syncTime = dataView.getUint32(offset, true);
    offset += 4;

    // Read 12 accel samples (each 6 bytes: int16 x, int16 y, int16 z)
    for (let i = 0; i < AccelConfig.SAMPLES_PER_FRAME; i++) {
      const rawX = dataView.getInt16(offset, true);
      offset += 2;
      const rawY = dataView.getInt16(offset, true);
      offset += 2;
      const rawZ = dataView.getInt16(offset, true);
      offset += 2;

      timestamps.push(syncTime);
      // Convert from Q13 fixed-point to g-units
      x.push(rawX / AccelConfig.Q13_SCALE);
      y.push(rawY / AccelConfig.Q13_SCALE);
      z.push(rawZ / AccelConfig.Q13_SCALE);
    }
  }

  return { timestamps, x, y, z };
}

// ============================================================================
// TEMPERATURE DECODING
// ============================================================================

/**
 * Decode temperature binary data.
 *
 * Frame format (8 bytes):
 * - 4 bytes: Little-endian uint32 timestamp (ms since epoch)
 * - 4 bytes: Little-endian float32 temperature (°C)
 *
 * @param data Raw binary data from temp.bin
 * @returns Object with timestamps and temperature values in °C
 */
export function decodeTemp(data: Uint8Array): DecodedTemp {
  const timestamps: number[] = [];
  const temps: number[] = [];

  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  while (offset + TempConfig.FRAME_SIZE <= data.length) {
    // Read timestamp (4 bytes, little-endian uint32)
    const syncTime = dataView.getUint32(offset, true);
    offset += 4;

    // Read temperature (4 bytes, little-endian float32)
    const temp = dataView.getFloat32(offset, true);
    offset += 4;

    timestamps.push(syncTime);
    temps.push(temp);
  }

  return { timestamps, temps };
}

// ============================================================================
// ROLLING BUFFER DECODING (for arousal windows - no timestamps)
// ============================================================================

/**
 * Decode rolling PPG buffer: simple uint16 array (no timestamps).
 *
 * Used for arousal window data transmitted over BLE.
 *
 * @param data Raw binary data
 * @returns Array of PPG sample values
 */
export function decodeRollingPPG(data: Uint8Array): number[] {
  const samples: number[] = [];
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  while (offset + 2 <= data.length) {
    const value = dataView.getUint16(offset, true);
    samples.push(value);
    offset += 2;
  }

  return samples;
}

/**
 * Decode rolling accel buffer: int16 x,y,z in Q13 format (no timestamps).
 *
 * Used for arousal window data transmitted over BLE.
 *
 * @param data Raw binary data
 * @returns Array of [x, y, z] samples in g-units
 */
export function decodeRollingAccel(data: Uint8Array): number[][] {
  const samples: number[][] = [];
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  while (offset + 6 <= data.length) {
    const rawX = dataView.getInt16(offset, true);
    const rawY = dataView.getInt16(offset + 2, true);
    const rawZ = dataView.getInt16(offset + 4, true);

    samples.push([
      rawX / AccelConfig.Q13_SCALE,
      rawY / AccelConfig.Q13_SCALE,
      rawZ / AccelConfig.Q13_SCALE,
    ]);
    offset += 6;
  }

  return samples;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if PPG binary data has valid frame alignment.
 */
export function isValidPPGData(data: Uint8Array): boolean {
  return data.length > 0 && data.length % PPGConfig.FRAME_SIZE === 0;
}

/**
 * Check if accelerometer binary data has valid frame alignment.
 */
export function isValidAccelData(data: Uint8Array): boolean {
  return data.length > 0 && data.length % AccelConfig.FRAME_SIZE === 0;
}

/**
 * Check if temperature binary data has valid frame alignment.
 */
export function isValidTempData(data: Uint8Array): boolean {
  return data.length > 0 && data.length % TempConfig.FRAME_SIZE === 0;
}

/**
 * Get expected sample count for PPG data.
 */
export function expectedPPGSampleCount(data: Uint8Array): number {
  return Math.floor(data.length / PPGConfig.FRAME_SIZE) * PPGConfig.SAMPLES_PER_FRAME;
}

/**
 * Get expected sample count for accelerometer data.
 */
export function expectedAccelSampleCount(data: Uint8Array): number {
  return Math.floor(data.length / AccelConfig.FRAME_SIZE) * AccelConfig.SAMPLES_PER_FRAME;
}

/**
 * Get expected sample count for temperature data.
 */
export function expectedTempSampleCount(data: Uint8Array): number {
  return Math.floor(data.length / TempConfig.FRAME_SIZE);
}
