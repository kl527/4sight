/**
 * Statistical Utilities
 *
 * Basic statistical functions for signal processing.
 *
 * Ported from: MaonV3/Services/SignalProcessing.swift
 */

/**
 * Calculate the arithmetic mean of an array.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate the standard deviation of an array.
 * Uses population standard deviation (N, not N-1).
 */
export function std(values: number[]): number {
  if (values.length <= 1) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) * (v - m), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate the sample standard deviation of an array.
 * Uses Bessel's correction (N-1).
 */
export function sampleStd(values: number[]): number {
  if (values.length <= 1) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) * (v - m), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Calculate the median of an array.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate the interquartile range (IQR) of an array.
 * IQR = Q3 - Q1
 */
export function iqr(values: number[]): number {
  if (values.length < 4) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length / 4);
  const q3Index = Math.floor((sorted.length * 3) / 4);
  return sorted[q3Index] - sorted[q1Index];
}

/**
 * Calculate a percentile of an array.
 * @param values The data array
 * @param p The percentile (0-100)
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(((sorted.length - 1) * p) / 100);
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

/**
 * Calculate Q1 (25th percentile).
 */
export function q1(values: number[]): number {
  return percentile(values, 25);
}

/**
 * Calculate Q3 (75th percentile).
 */
export function q3(values: number[]): number {
  return percentile(values, 75);
}

/**
 * Calculate the minimum value.
 */
export function min(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

/**
 * Calculate the maximum value.
 */
export function max(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

/**
 * Calculate the range (max - min).
 */
export function range(values: number[]): number {
  if (values.length === 0) return 0;
  return max(values) - min(values);
}

/**
 * Calculate the sum of an array.
 */
export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/**
 * Calculate the root mean square (RMS).
 */
export function rms(values: number[]): number {
  if (values.length === 0) return 0;
  const sumSquares = values.reduce((acc, v) => acc + v * v, 0);
  return Math.sqrt(sumSquares / values.length);
}

/**
 * Calculate the variance.
 */
export function variance(values: number[]): number {
  if (values.length <= 1) return 0;
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) * (v - m), 0) / values.length;
}

/**
 * Calculate the median absolute deviation (MAD).
 * MAD = median(|Xi - median(X)|)
 */
export function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

/**
 * Normalize data to [0, 1] range using min-max normalization.
 * @param data The data array
 * @returns Normalized array with values in [0, 1]
 */
export function normalize(data: number[]): number[] {
  if (data.length === 0) return [];

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const dataRange = maxVal - minVal;

  // Avoid division by zero for constant data
  if (dataRange <= 1e-10) {
    return new Array(data.length).fill(0);
  }

  return data.map((v) => (v - minVal) / dataRange);
}
