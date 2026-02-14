/**
 * Median Filter
 *
 * Simple sliding window median filter for impulse noise removal.
 */
import { median } from '../statistics';

/**
 * Apply median filter to a signal.
 *
 * The median filter replaces each sample with the median of a local window
 * centered on that sample. Effective for removing impulse noise while
 * preserving edge information.
 *
 * @param data Input signal
 * @param windowSize Size of the sliding window (default: 3)
 * @returns Filtered signal
 */
export function medianFilter(data: number[], windowSize: number = 3): number[] {
  if (data.length === 0) return [];
  if (windowSize <= 1) return [...data];

  const halfWindow = Math.floor(windowSize / 2);
  const result: number[] = new Array(data.length);

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(data.length, i + halfWindow + 1);
    const window = data.slice(start, end);
    result[i] = median(window);
  }

  return result;
}

/**
 * Apply weighted median filter.
 *
 * Similar to median filter but with triangular weights giving higher
 * weight to samples closer to the center.
 *
 * @param data Input signal
 * @param windowSize Size of the sliding window (default: 5)
 * @returns Filtered signal
 */
export function weightedMedianFilter(data: number[], windowSize: number = 5): number[] {
  if (data.length === 0) return [];
  if (windowSize <= 1) return [...data];

  const halfWindow = Math.floor(windowSize / 2);
  const result: number[] = new Array(data.length);

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(data.length, i + halfWindow + 1);

    // Create expanded array with triangular weights
    const expandedValues: number[] = [];
    for (let j = start; j < end; j++) {
      const distance = Math.abs(j - i);
      const weight = halfWindow - distance + 1;
      // Add value 'weight' times to give it more influence in the median
      for (let k = 0; k < weight; k++) {
        expandedValues.push(data[j]);
      }
    }

    result[i] = median(expandedValues);
  }

  return result;
}
