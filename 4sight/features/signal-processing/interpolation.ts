/**
 * Interpolation Utilities
 *
 * Linear interpolation for signal reconstruction.
 */

/**
 * Linear interpolation between two points.
 * @param x0 First x value
 * @param y0 First y value (at x0)
 * @param x1 Second x value
 * @param y1 Second y value (at x1)
 * @param x Target x value to interpolate
 */
export function lerp(x0: number, y0: number, x1: number, y1: number, x: number): number {
  if (Math.abs(x1 - x0) < 1e-10) return y0;
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

/**
 * Linear interpolation with binary search for sorted x values.
 * @param x Target x value to interpolate
 * @param xValues Sorted array of x values
 * @param yValues Corresponding y values
 */
export function linearInterpolate(x: number, xValues: number[], yValues: number[]): number {
  if (xValues.length === 0 || xValues.length !== yValues.length) return 0;
  if (xValues.length === 1) return yValues[0];

  // Handle boundary cases
  if (x <= xValues[0]) return yValues[0];
  if (x >= xValues[xValues.length - 1]) return yValues[yValues.length - 1];

  // Binary search for the interval containing x
  let low = 0;
  let high = xValues.length - 1;

  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (xValues[mid] <= x) {
      low = mid;
    } else {
      high = mid;
    }
  }

  // Linear interpolation between xValues[low] and xValues[high]
  return lerp(xValues[low], yValues[low], xValues[high], yValues[high], x);
}

/**
 * Interpolate at multiple points.
 * @param xs Target x values to interpolate
 * @param xValues Sorted array of known x values
 * @param yValues Corresponding known y values
 */
export function interpolateMultiple(
  xs: number[],
  xValues: number[],
  yValues: number[]
): number[] {
  return xs.map((x) => linearInterpolate(x, xValues, yValues));
}

/**
 * Fill gaps in a signal using linear interpolation.
 * @param data The signal with gaps (marked by mask)
 * @param mask Boolean array where true indicates a gap to fill
 */
export function fillGaps(data: number[], mask: boolean[]): number[] {
  if (data.length !== mask.length) {
    throw new Error('Data and mask must have the same length');
  }

  const result = [...data];

  // Get indices and values of good (non-gap) points
  const goodIndices: number[] = [];
  const goodValues: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (!mask[i]) {
      goodIndices.push(i);
      goodValues.push(data[i]);
    }
  }

  if (goodIndices.length < 2) {
    // Not enough good points to interpolate
    return result;
  }

  // Interpolate gap locations
  for (let i = 0; i < data.length; i++) {
    if (mask[i]) {
      result[i] = linearInterpolate(i, goodIndices, goodValues);
    }
  }

  return result;
}

/**
 * Resample a signal to a new length using linear interpolation.
 * @param data Original signal
 * @param newLength Target length
 */
export function resample(data: number[], newLength: number): number[] {
  if (data.length === 0) return [];
  if (newLength <= 0) return [];
  if (data.length === 1) return new Array(newLength).fill(data[0]);

  const xOld = data.map((_, i) => i);
  const result: number[] = [];

  for (let i = 0; i < newLength; i++) {
    const x = (i * (data.length - 1)) / (newLength - 1);
    result.push(linearInterpolate(x, xOld, data));
  }

  return result;
}
