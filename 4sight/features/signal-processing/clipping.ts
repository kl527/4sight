/**
 * Clipping Detection and Fix
 *
 * Detect and interpolate clipped/saturated regions in signals.
 */
import { fillGaps } from './interpolation';
import type { ClippingFixResult } from './types';

/**
 * Detect and interpolate clipped/saturated regions.
 *
 * Clipping occurs when the signal exceeds the sensor's dynamic range,
 * resulting in flat regions at the min or max values.
 *
 * @param data Input signal
 * @param clipThresholdPercentile Percentile for detecting clip boundaries (default: 0.5)
 * @returns Object with fixed signal and clipped region mask
 */
export function fixClipping(
  data: number[],
  clipThresholdPercentile: number = 0.5
): ClippingFixResult {
  if (data.length === 0) {
    return { fixed: [], clippedMask: [] };
  }

  const result = [...data];
  const clippedMask = new Array(data.length).fill(false);

  // Find potential clipping thresholds
  const sorted = [...data].sort((a, b) => a - b);
  const lowIdx = Math.floor((sorted.length * clipThresholdPercentile) / 100.0);
  const highIdx = Math.floor((sorted.length * (100.0 - clipThresholdPercentile)) / 100.0);

  const lowThresh = sorted[Math.max(0, lowIdx)];
  const highThresh = sorted[Math.min(sorted.length - 1, highIdx)];

  // Detect clipped regions
  // A point is considered clipped if:
  // 1. It's at or beyond the threshold values, AND
  // 2. It's part of a flat region (same value as neighbor)
  for (let i = 0; i < data.length; i++) {
    if (data[i] <= lowThresh || data[i] >= highThresh) {
      // Check if it's a flat region (same as previous value)
      if (i > 0 && Math.abs(data[i] - data[i - 1]) < 1e-10) {
        clippedMask[i] = true;
      }
    }
  }

  // Count clipped points
  const clippedCount = clippedMask.filter((v) => v).length;

  // Only interpolate if we have enough good points
  if (clippedCount > 0 && clippedCount < data.length - 1) {
    return { fixed: fillGaps(data, clippedMask), clippedMask };
  }

  return { fixed: result, clippedMask };
}

/**
 * Detect clipping using flat region detection.
 *
 * Identifies consecutive samples with the same value as potentially clipped.
 *
 * @param data Input signal
 * @param minFlatLength Minimum length of flat region to consider as clipping (default: 3)
 * @returns Boolean mask where true indicates clipped sample
 */
export function detectFlatRegions(data: number[], minFlatLength: number = 3): boolean[] {
  if (data.length === 0) {
    return [];
  }

  const mask = new Array(data.length).fill(false);
  let runStart = 0;
  let runLength = 1;

  for (let i = 1; i < data.length; i++) {
    if (Math.abs(data[i] - data[i - 1]) < 1e-10) {
      runLength++;
    } else {
      // End of run - mark as clipped if long enough
      if (runLength >= minFlatLength) {
        for (let j = runStart; j < i; j++) {
          mask[j] = true;
        }
      }
      runStart = i;
      runLength = 1;
    }
  }

  // Handle final run
  if (runLength >= minFlatLength) {
    for (let j = runStart; j < data.length; j++) {
      mask[j] = true;
    }
  }

  return mask;
}

/**
 * Fix clipping using flat region detection.
 *
 * @param data Input signal
 * @param minFlatLength Minimum length of flat region to consider as clipping (default: 3)
 * @returns Object with fixed signal and clipped region mask
 */
export function fixFlatRegions(data: number[], minFlatLength: number = 3): ClippingFixResult {
  const clippedMask = detectFlatRegions(data, minFlatLength);
  const clippedCount = clippedMask.filter((v) => v).length;

  if (clippedCount > 0 && clippedCount < data.length - 1) {
    return { fixed: fillGaps(data, clippedMask), clippedMask };
  }

  return { fixed: [...data], clippedMask };
}

/**
 * Combined clipping fix using both percentile and flat region detection.
 *
 * @param data Input signal
 * @param clipThresholdPercentile Percentile for detecting clip boundaries (default: 0.5)
 * @param minFlatLength Minimum flat region length (default: 3)
 * @returns Object with fixed signal and combined clipped mask
 */
export function fixClippingCombined(
  data: number[],
  clipThresholdPercentile: number = 0.5,
  minFlatLength: number = 3
): ClippingFixResult {
  const { clippedMask: percentileMask } = fixClipping(data, clipThresholdPercentile);
  const flatMask = detectFlatRegions(data, minFlatLength);

  // Combine masks (OR operation)
  const combinedMask = percentileMask.map((v, i) => v || flatMask[i]);
  const clippedCount = combinedMask.filter((v) => v).length;

  if (clippedCount > 0 && clippedCount < data.length - 1) {
    return { fixed: fillGaps(data, combinedMask), clippedMask: combinedMask };
  }

  return { fixed: [...data], clippedMask: combinedMask };
}
