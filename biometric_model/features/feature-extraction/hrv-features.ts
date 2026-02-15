/**
 * HRV Features
 *
 * Time-domain HRV feature computation from RR intervals.
 *
 * Ported from: MaonV3/Services/FeatureExtractor.swift
 */

import { mean, std, median, iqr, min, max } from '../signal-processing';
import type { TimeDomainFeatures } from './types';
import { rrToHeartRate, successiveDifferences } from './rr-extraction';

/**
 * Compute all time-domain HRV features from RR intervals.
 *
 * Features computed (15 total):
 * - HR: mean, std, min, max
 * - RR: mean (meanRR), SDNN, RMSSD, SDSD
 * - pNN50, pNN20
 * - CVNN, CVSD
 * - medianRR, rangeRR, iqrRR
 *
 * @param rrIntervals Valid RR intervals in milliseconds
 * @returns Time-domain features object
 */
export function computeTimeDomainFeatures(rrIntervals: number[]): TimeDomainFeatures {
  const rr = rrIntervals;

  // Heart rates (BPM)
  const hrs = rrToHeartRate(rr);
  const hrMean = mean(hrs);
  const hrStd = std(hrs);
  const hrMin = min(hrs);
  const hrMax = max(hrs);

  // RR statistics
  const meanRR = mean(rr);
  const sdnn = std(rr);
  const medianRR = median(rr);
  const rangeRR = max(rr) - min(rr);
  const iqrRR = iqr(rr);

  // Successive differences
  const diffs = successiveDifferences(rr);

  const sdsd = std(diffs);
  const squaredDiffs = diffs.map((d) => d * d);
  const rmssd = Math.sqrt(mean(squaredDiffs));

  // pNNxx calculations
  const nn50 = diffs.filter((d) => Math.abs(d) > 50).length;
  const nn20 = diffs.filter((d) => Math.abs(d) > 20).length;
  const pnn50 = diffs.length > 0 ? (nn50 / diffs.length) * 100 : 0;
  const pnn20 = diffs.length > 0 ? (nn20 / diffs.length) * 100 : 0;

  // Coefficients of variation
  const cvnn = meanRR > 0 ? sdnn / meanRR : 0;
  const cvsd = meanRR > 0 ? rmssd / meanRR : 0;

  return {
    hrMean,
    hrStd,
    hrMin,
    hrMax,
    meanRR,
    sdnn,
    rmssd,
    sdsd,
    pnn50,
    pnn20,
    cvnn,
    cvsd,
    medianRR,
    rangeRR,
    iqrRR,
  };
}

/**
 * Compute basic HRV metrics (subset for quick analysis).
 *
 * @param rrIntervals Valid RR intervals in milliseconds
 * @returns Object with basic HRV metrics
 */
export function computeBasicHRV(rrIntervals: number[]): {
  hrMean: number;
  sdnn: number;
  rmssd: number;
} {
  const hrs = rrToHeartRate(rrIntervals);
  const hrMean = mean(hrs);
  const sdnn = std(rrIntervals);

  const diffs = successiveDifferences(rrIntervals);
  const squaredDiffs = diffs.map((d) => d * d);
  const rmssd = Math.sqrt(mean(squaredDiffs));

  return { hrMean, sdnn, rmssd };
}

/**
 * Compute RMSSD from RR intervals.
 * RMSSD is a key measure of vagal-mediated HRV.
 *
 * @param rrIntervals RR intervals in milliseconds
 * @returns RMSSD value
 */
export function computeRMSSD(rrIntervals: number[]): number {
  const diffs = successiveDifferences(rrIntervals);
  if (diffs.length === 0) return 0;
  const squaredDiffs = diffs.map((d) => d * d);
  return Math.sqrt(mean(squaredDiffs));
}

/**
 * Compute SDNN from RR intervals.
 * SDNN reflects overall HRV.
 *
 * @param rrIntervals RR intervals in milliseconds
 * @returns SDNN value
 */
export function computeSDNN(rrIntervals: number[]): number {
  return std(rrIntervals);
}
