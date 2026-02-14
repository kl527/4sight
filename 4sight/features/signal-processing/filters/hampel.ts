/**
 * Hampel Filter
 *
 * Robust outlier detection and removal using median absolute deviation (MAD).
 */
import { median } from '../statistics';
import type { HampelFilterResult } from '../types';

/**
 * Scale factor to estimate standard deviation from MAD.
 * For a normal distribution, std ≈ 1.4826 × MAD
 */
const MAD_SCALE_FACTOR = 1.4826;

/**
 * Hampel filter for robust outlier detection and removal.
 *
 * The Hampel filter identifies outliers by comparing each point to the local
 * median. Points that deviate more than `nSigma × MAD` (median absolute deviation)
 * are replaced with the local median.
 *
 * @param data Input signal
 * @param windowSize Size of sliding window (should be odd). Larger = more aggressive.
 * @param nSigma Number of MADs for outlier threshold. Lower = more aggressive.
 * @returns Object containing filtered signal and outlier indices
 */
export function hampelFilter(
  data: number[],
  windowSize: number = 7,
  nSigma: number = 3.0
): HampelFilterResult {
  if (data.length === 0) {
    return { filtered: [], outlierIndices: [] };
  }

  const filtered = [...data];
  const outlierIndices: number[] = [];

  // Ensure odd window size
  const adjustedWindow = windowSize % 2 === 0 ? windowSize + 1 : windowSize;
  const halfWindow = Math.floor(adjustedWindow / 2);

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(data.length, i + halfWindow + 1);

    const window = data.slice(start, end);
    const localMedian = median(window);

    // Median Absolute Deviation
    const deviations = window.map((v) => Math.abs(v - localMedian));
    const mad = median(deviations);

    // Threshold (scaled MAD approximates std for normal distribution)
    const threshold = nSigma * MAD_SCALE_FACTOR * mad;

    // Check if current point is outlier
    if (mad > 0 && Math.abs(data[i] - localMedian) > threshold) {
      filtered[i] = localMedian;
      outlierIndices.push(i);
    }
  }

  return { filtered, outlierIndices };
}

/**
 * Apply Hampel filter iteratively until no more outliers are found.
 *
 * This catches outliers that were masked by nearby outliers in previous passes.
 *
 * @param data Input signal
 * @param windowSize Size of sliding window (default: 7)
 * @param nSigma Number of MADs for outlier threshold (default: 3.0)
 * @param maxIterations Maximum number of passes (default: 3)
 * @returns Object containing filtered signal and all outlier indices
 */
export function iterativeHampel(
  data: number[],
  windowSize: number = 7,
  nSigma: number = 3.0,
  maxIterations: number = 3
): HampelFilterResult {
  let result = [...data];
  const allOutliers: Set<number> = new Set();

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const { filtered, outlierIndices } = hampelFilter(result, windowSize, nSigma);

    if (outlierIndices.length === 0) {
      // No more outliers found
      break;
    }

    result = filtered;
    outlierIndices.forEach((idx) => allOutliers.add(idx));
  }

  // Return unique sorted indices
  const uniqueOutliers = Array.from(allOutliers).sort((a, b) => a - b);

  return { filtered: result, outlierIndices: uniqueOutliers };
}

/**
 * Detect outliers using Hampel method without replacing them.
 *
 * @param data Input signal
 * @param windowSize Size of sliding window (default: 7)
 * @param nSigma Number of MADs for outlier threshold (default: 3.0)
 * @returns Boolean array where true indicates outlier
 */
export function detectOutliers(
  data: number[],
  windowSize: number = 7,
  nSigma: number = 3.0
): boolean[] {
  const { outlierIndices } = hampelFilter(data, windowSize, nSigma);
  const mask = new Array(data.length).fill(false);
  outlierIndices.forEach((idx) => {
    mask[idx] = true;
  });
  return mask;
}
