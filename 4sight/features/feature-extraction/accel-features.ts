/**
 * Accelerometer Features
 *
 * Feature extraction from accelerometer data.
 *
 */

import {
  mean,
  std,
  max,
  iterativeHampel,
  medianFilter,
} from '@/features/signal-processing';
import type { AccelPreprocessingConfig } from '@/features/signal-processing/types';
import { DEFAULT_ACCEL_CONFIG } from '@/features/signal-processing/types';
import type { AccelFeatures } from './types';

/**
 * Compute accelerometer features from raw accel data.
 *
 * Features computed (11 total):
 * - Per-axis: meanX, meanY, meanZ, stdX, stdY, stdZ
 * - Magnitude: magnitudeMean, magnitudeStd, magnitudeMax
 * - Movement: intensity (variance of magnitude), energy (sum of squared magnitudes)
 *
 * @param x X-axis values in g-units
 * @param y Y-axis values in g-units
 * @param z Z-axis values in g-units
 * @param _sampleRate Sample rate in Hz (unused but kept for API consistency)
 * @param config Preprocessing configuration
 * @returns Accelerometer features object
 */
export function computeAccelFeatures(
  x: number[],
  y: number[],
  z: number[],
  _sampleRate: number = 12.0,
  config: AccelPreprocessingConfig = DEFAULT_ACCEL_CONFIG
): AccelFeatures {
  if (x.length === 0) {
    return {
      meanX: 0,
      meanY: 0,
      meanZ: 0,
      stdX: 0,
      stdY: 0,
      stdZ: 0,
      magnitudeMean: 0,
      magnitudeStd: 0,
      magnitudeMax: 0,
      intensity: 0,
      energy: 0,
    };
  }

  // Preprocess accelerometer (Hampel filter + median filter)
  const { filtered: xFiltered } = iterativeHampel(
    x,
    config.hampelWindowSize,
    config.hampelSigma,
    config.hampelMaxIterations
  );
  const { filtered: yFiltered } = iterativeHampel(
    y,
    config.hampelWindowSize,
    config.hampelSigma,
    config.hampelMaxIterations
  );
  const { filtered: zFiltered } = iterativeHampel(
    z,
    config.hampelWindowSize,
    config.hampelSigma,
    config.hampelMaxIterations
  );

  const xClean = medianFilter(xFiltered, config.medianWindowSize);
  const yClean = medianFilter(yFiltered, config.medianWindowSize);
  const zClean = medianFilter(zFiltered, config.medianWindowSize);

  // Per-axis stats
  const meanX = mean(xClean);
  const meanY = mean(yClean);
  const meanZ = mean(zClean);
  const stdX = std(xClean);
  const stdY = std(yClean);
  const stdZ = std(zClean);

  // Magnitude calculation
  const magnitudes: number[] = [];
  for (let i = 0; i < xClean.length; i++) {
    const mag = Math.sqrt(
      xClean[i] * xClean[i] + yClean[i] * yClean[i] + zClean[i] * zClean[i]
    );
    magnitudes.push(mag);
  }

  const magnitudeMean = mean(magnitudes);
  const magnitudeStd = std(magnitudes);
  const magnitudeMax = max(magnitudes);

  // Movement intensity (variance of magnitude)
  const intensity = magnitudeStd * magnitudeStd;

  // Total energy (sum of squared magnitudes)
  const energy = magnitudes.reduce((sum, mag) => sum + mag * mag, 0);

  return {
    meanX,
    meanY,
    meanZ,
    stdX,
    stdY,
    stdZ,
    magnitudeMean,
    magnitudeStd,
    magnitudeMax,
    intensity,
    energy,
  };
}

/**
 * Compute accelerometer features from 2D array format.
 *
 * @param accel Array of [x, y, z] samples
 * @param sampleRate Sample rate in Hz
 * @param config Preprocessing configuration
 * @returns Accelerometer features object
 */
export function computeAccelFeaturesFrom2D(
  accel: number[][],
  sampleRate: number = 12.0,
  config: AccelPreprocessingConfig = DEFAULT_ACCEL_CONFIG
): AccelFeatures {
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];

  for (const sample of accel) {
    if (sample.length >= 3) {
      x.push(sample[0]);
      y.push(sample[1]);
      z.push(sample[2]);
    }
  }

  return computeAccelFeatures(x, y, z, sampleRate, config);
}

/**
 * Compute basic movement metrics (fast path for arousal detection).
 *
 * @param x X-axis values in g-units
 * @param y Y-axis values in g-units
 * @param z Z-axis values in g-units
 * @returns Object with magnitudeMean and magnitudeStd
 */
export function computeBasicMovement(
  x: number[],
  y: number[],
  z: number[]
): { magnitudeMean: number; magnitudeStd: number } {
  if (x.length === 0) {
    return { magnitudeMean: 0, magnitudeStd: 0 };
  }

  const magnitudes: number[] = [];
  for (let i = 0; i < x.length; i++) {
    const mag = Math.sqrt(x[i] * x[i] + y[i] * y[i] + z[i] * z[i]);
    magnitudes.push(mag);
  }

  return {
    magnitudeMean: mean(magnitudes),
    magnitudeStd: std(magnitudes),
  };
}
