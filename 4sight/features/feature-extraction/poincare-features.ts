/**
 * Poincaré Features
 *
 * Non-linear HRV analysis using Poincaré plot features.
 */
import type { NonLinearFeatures } from './types';

/**
 * Compute non-linear (Poincaré) features from SDNN and SDSD.
 *
 * Poincaré plot analysis provides insight into short-term (SD1) and
 * long-term (SD2) heart rate variability.
 *
 * Features:
 * - SD1: Short-term HRV (beat-to-beat variability)
 * - SD2: Long-term HRV (overall variability)
 * - SD1/SD2: Ratio indicating sympathovagal balance
 * - Area: Ellipse area (π × SD1 × SD2)
 *
 * @param sdnn Standard deviation of RR intervals
 * @param sdsd Standard deviation of successive differences
 * @returns Non-linear features object
 */
export function computeNonLinearFeatures(sdnn: number, sdsd: number): NonLinearFeatures {
  // Poincaré plot features
  // SD1 represents short-term variability (perpendicular to line of identity)
  const sd1 = (1.0 / Math.sqrt(2.0)) * sdsd;

  // SD2 represents long-term variability (along line of identity)
  const sd2Term = 2.0 * sdnn * sdnn - 0.5 * sdsd * sdsd;
  const sd2 = sd2Term > 0 ? Math.sqrt(sd2Term) : 0;

  // SD1/SD2 ratio (sympathovagal balance indicator)
  const sd1sd2 = sd2 > 0 ? sd1 / sd2 : 0;

  // Ellipse area
  const area = Math.PI * sd1 * sd2;

  return { sd1, sd2, sd1sd2, area };
}

/**
 * Compute Poincaré features directly from RR intervals.
 *
 * @param rrIntervals RR intervals in milliseconds
 * @returns Non-linear features object
 */
export function computePoincareFeaturesFromRR(rrIntervals: number[]): NonLinearFeatures {
  if (rrIntervals.length < 2) {
    return { sd1: 0, sd2: 0, sd1sd2: 0, area: 0 };
  }

  // Compute SDNN
  const mean = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
  const sdnn = Math.sqrt(
    rrIntervals.reduce((sum, rr) => sum + (rr - mean) * (rr - mean), 0) / rrIntervals.length
  );

  // Compute SDSD
  const diffs: number[] = [];
  for (let i = 1; i < rrIntervals.length; i++) {
    diffs.push(rrIntervals[i] - rrIntervals[i - 1]);
  }

  if (diffs.length === 0) {
    return { sd1: 0, sd2: 0, sd1sd2: 0, area: 0 };
  }

  const diffMean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const sdsd = Math.sqrt(
    diffs.reduce((sum, d) => sum + (d - diffMean) * (d - diffMean), 0) / diffs.length
  );

  return computeNonLinearFeatures(sdnn, sdsd);
}

/**
 * Compute Poincaré plot coordinates.
 *
 * Returns pairs of (RR[i], RR[i+1]) for plotting.
 *
 * @param rrIntervals RR intervals in milliseconds
 * @returns Array of [x, y] coordinate pairs
 */
export function computePoincarePlotData(rrIntervals: number[]): [number, number][] {
  const points: [number, number][] = [];

  for (let i = 0; i < rrIntervals.length - 1; i++) {
    points.push([rrIntervals[i], rrIntervals[i + 1]]);
  }

  return points;
}
