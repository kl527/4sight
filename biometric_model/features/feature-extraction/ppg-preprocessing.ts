/**
 * PPG Preprocessing Pipeline
 *
 * 7-stage preprocessing pipeline for PPG signals.
 *
 * Ported from: MaonV3/Services/FeatureExtractor.swift
 */

import {
  fixClipping,
  iterativeHampel,
  gradientSpikeRemoval,
  medianFilter,
  butterworthHighpass,
  butterworthBandpass,
  savgolFilter,
} from '../signal-processing';
import type { PPGPreprocessingConfig } from '../signal-processing/types';
import { DEFAULT_PPG_CONFIG } from '../signal-processing/types';

/**
 * Full PPG preprocessing pipeline.
 *
 * Stages:
 * 1. Fix clipping/saturation
 * 2. Iterative Hampel filter (aggressive spike removal)
 * 3. Gradient-based spike removal
 * 4. Median filter
 * 5. Remove baseline wander (highpass)
 * 6. Bandpass filter
 * 7. Savitzky-Golay smoothing
 *
 * @param samples Raw PPG samples
 * @param sampleRate Sample rate in Hz (default: 25)
 * @param config Preprocessing configuration
 * @returns Preprocessed PPG signal
 */
export function preprocessPPG(
  samples: number[],
  sampleRate: number = 25.0,
  config: PPGPreprocessingConfig = DEFAULT_PPG_CONFIG
): number[] {
  if (samples.length === 0) {
    return [];
  }

  let ppg = [...samples];

  // Stage 1: Fix clipping/saturation
  const { fixed: clipped } = fixClipping(ppg);
  ppg = clipped;

  // Stage 2: Iterative Hampel filter (aggressive spike removal)
  const { filtered: hampeled } = iterativeHampel(
    ppg,
    config.hampelWindowSize,
    config.hampelSigma,
    config.hampelMaxIterations
  );
  ppg = hampeled;

  // Stage 3: Gradient-based spike removal
  const { filtered: gradientFiltered } = gradientSpikeRemoval(
    ppg,
    config.gradientThresholdFactor
  );
  ppg = gradientFiltered;

  // Stage 4: Median filter
  ppg = medianFilter(ppg, config.medianWindowSize);

  // Stage 5: Remove baseline wander (highpass)
  ppg = butterworthHighpass(ppg, sampleRate, config.highpassCutoff, config.butterworthOrder);

  // Stage 6: Bandpass filter
  ppg = butterworthBandpass(
    ppg,
    sampleRate,
    config.bandpassLowCutoff,
    config.bandpassHighCutoff,
    config.butterworthOrder
  );

  // Stage 7: Savitzky-Golay smoothing
  ppg = savgolFilter(ppg, config.savgolWindowSize, config.savgolPolyOrder);

  return ppg;
}

/**
 * Minimal preprocessing for quick analysis.
 *
 * Only applies:
 * - Hampel filter
 * - Highpass filter (baseline removal)
 *
 * @param samples Raw PPG samples
 * @param sampleRate Sample rate in Hz
 * @returns Minimally preprocessed signal
 */
export function preprocessPPGFast(
  samples: number[],
  sampleRate: number = 25.0
): number[] {
  if (samples.length === 0) {
    return [];
  }

  // Quick Hampel filter
  const { filtered: hampeled } = iterativeHampel(samples, 5, 3.0, 1);

  // Highpass for baseline removal
  return butterworthHighpass(hampeled, sampleRate, 0.5, 2);
}

/**
 * Check if PPG data is valid for processing.
 *
 * @param samples PPG samples
 * @returns True if data is valid
 */
export function isValidPPGForProcessing(samples: number[]): boolean {
  if (samples.length === 0) {
    return false;
  }

  // Check if all zeros
  if (samples.every((s) => s === 0)) {
    return false;
  }

  // Check for reasonable variance (not all same value)
  const first = samples[0];
  if (samples.every((s) => s === first)) {
    return false;
  }

  return true;
}

/**
 * Normalize PPG signal to [0, 1] range.
 *
 * @param samples PPG samples
 * @returns Normalized signal
 */
export function normalizePPG(samples: number[]): number[] {
  if (samples.length === 0) {
    return [];
  }

  const minVal = Math.min(...samples);
  const maxVal = Math.max(...samples);
  const range = maxVal - minVal;

  if (range < 1e-10) {
    return new Array(samples.length).fill(0);
  }

  return samples.map((s) => (s - minVal) / range);
}
