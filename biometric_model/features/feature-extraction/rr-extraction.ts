/**
 * RR Interval Extraction
 *
 * Peak detection and RR interval calculation from preprocessed PPG.
 *
 * Ported from: MaonV3/Services/FeatureExtractor.swift
 */

import type { PPGPreprocessingConfig } from '../signal-processing/types';
import type { RRResult, ExtractionFailureReason } from './types';

/**
 * Find peaks in signal with minimum distance constraint.
 *
 * @param signal Input signal (typically preprocessed PPG)
 * @param minDistance Minimum samples between peaks
 * @returns Array of peak indices
 */
export function findPeaks(signal: number[], minDistance: number): number[] {
  const peaks: number[] = [];

  if (signal.length <= 2) return peaks;

  // Simple peak detection: point higher than both neighbors
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
        peaks.push(i);
      } else if (signal[i] > signal[peaks[peaks.length - 1]]) {
        // Replace last peak if this one is higher and within minDistance
        peaks[peaks.length - 1] = i;
      }
    }
  }

  return peaks;
}

/**
 * Extract RR intervals from preprocessed PPG with diagnostic info.
 *
 * @param ppg Preprocessed PPG signal
 * @param sampleRate Sample rate in Hz
 * @param config PPG preprocessing configuration with RR interval thresholds
 * @returns Object with result or failure reason
 */
export function extractRRIntervalsWithDiagnostics(
  ppg: number[],
  sampleRate: number,
  config: PPGPreprocessingConfig
): { result: RRResult | null; failureReason: ExtractionFailureReason | null } {
  // Find peaks with minimum distance constraint
  const minDistance = Math.floor(sampleRate * config.minPeakDistanceFactor);
  const peaks = findPeaks(ppg, minDistance);

  if (peaks.length < 3) {
    return {
      result: null,
      failureReason: { type: 'insufficientPeaks', found: peaks.length, required: 3 },
    };
  }

  // Calculate RR intervals in milliseconds
  const rrIntervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const rrMs = ((peaks[i] - peaks[i - 1]) / sampleRate) * 1000;
    rrIntervals.push(rrMs);
  }

  // Filter physiologically plausible RR intervals
  const validRR = rrIntervals.filter(
    (rr) => rr >= config.minRRInterval && rr <= config.maxRRInterval
  );
  const outlierCount = rrIntervals.length - validRR.length;

  if (validRR.length < 2) {
    return {
      result: null,
      failureReason: { type: 'insufficientValidRR', found: validRR.length, required: 2 },
    };
  }

  return {
    result: {
      validRR,
      peakCount: peaks.length,
      outlierCount,
    },
    failureReason: null,
  };
}

/**
 * Extract RR intervals from preprocessed PPG.
 *
 * @param ppg Preprocessed PPG signal
 * @param sampleRate Sample rate in Hz
 * @param config PPG preprocessing configuration
 * @returns RR extraction result or null if failed
 */
export function extractRRIntervals(
  ppg: number[],
  sampleRate: number,
  config: PPGPreprocessingConfig
): RRResult | null {
  const { result } = extractRRIntervalsWithDiagnostics(ppg, sampleRate, config);
  return result;
}

/**
 * Compute heart rates from RR intervals.
 *
 * @param rrIntervals RR intervals in milliseconds
 * @returns Heart rates in BPM
 */
export function rrToHeartRate(rrIntervals: number[]): number[] {
  return rrIntervals.map((rr) => 60000 / rr);
}

/**
 * Compute successive differences of RR intervals.
 *
 * @param rrIntervals RR intervals in milliseconds
 * @returns Successive differences (RRi+1 - RRi)
 */
export function successiveDifferences(rrIntervals: number[]): number[] {
  const diffs: number[] = [];
  for (let i = 1; i < rrIntervals.length; i++) {
    diffs.push(rrIntervals[i] - rrIntervals[i - 1]);
  }
  return diffs;
}
