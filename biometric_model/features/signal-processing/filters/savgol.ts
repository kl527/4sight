/**
 * Savitzky-Golay Filter
 *
 * Smoothing filter that preserves peak shapes better than moving average.
 *
 * Ported from: MaonV3/Services/SignalProcessing.swift
 */

/**
 * Savitzky-Golay filter for smoothing while preserving peak shapes.
 *
 * Better than moving average because it preserves the height and width
 * of peaks in the signal (important for PPG peak detection).
 *
 * Note: This implementation uses an approximation with parabolic weighting
 * rather than full least-squares polynomial fitting, matching the Swift
 * implementation.
 *
 * @param data Input signal
 * @param windowSize Size of the smoothing window (should be odd, default: 11)
 * @param polyOrder Polynomial order (default: 3, not fully used in approximation)
 * @returns Smoothed signal
 */
export function savgolFilter(
  data: number[],
  windowSize: number = 11,
  polyOrder: number = 3
): number[] {
  if (data.length === 0) return [];

  // Ensure window_size is odd and valid
  let adjustedWindow = windowSize % 2 === 0 ? windowSize + 1 : windowSize;
  adjustedWindow = Math.max(adjustedWindow, polyOrder + 2);

  // Handle short signals
  if (data.length < adjustedWindow) {
    return [...data];
  }

  const halfWindow = Math.floor(adjustedWindow / 2);

  // Compute filter coefficients using parabolic weighting
  const coefficients = computeSavgolCoefficients(adjustedWindow, polyOrder);

  const result = [...data];

  // Apply filter (skip edges to avoid boundary effects)
  for (let i = halfWindow; i < data.length - halfWindow; i++) {
    let sum = 0;
    for (let j = 0; j < adjustedWindow; j++) {
      sum += coefficients[j] * data[i - halfWindow + j];
    }
    result[i] = sum;
  }

  return result;
}

/**
 * Compute Savitzky-Golay filter coefficients.
 *
 * This uses an approximation with parabolic weighting for simplicity.
 * For true S-G coefficients, a full least-squares polynomial fit would
 * be needed, but this approximation works well for typical use cases.
 */
function computeSavgolCoefficients(windowSize: number, polyOrder: number): number[] {
  const halfWindow = Math.floor(windowSize / 2);

  // Start with uniform weights
  let coefficients = new Array(windowSize).fill(1.0 / windowSize);

  // Apply parabolic weighting for better peak preservation (when polyOrder >= 2)
  if (polyOrder >= 2) {
    for (let i = 0; i < windowSize; i++) {
      const x = (i - halfWindow) / halfWindow;
      // Parabolic window: higher weight near center
      coefficients[i] = 1.0 - x * x;
    }

    // Normalize so weights sum to 1
    const sum = coefficients.reduce((acc, v) => acc + v, 0);
    if (sum > 0) {
      coefficients = coefficients.map((c) => c / sum);
    }
  }

  return coefficients;
}

/**
 * Apply Savitzky-Golay filter with edge handling.
 *
 * Extends the signal at boundaries using reflection to reduce edge effects.
 *
 * @param data Input signal
 * @param windowSize Size of the smoothing window (default: 11)
 * @param polyOrder Polynomial order (default: 3)
 * @returns Smoothed signal with same length as input
 */
export function savgolFilterWithEdges(
  data: number[],
  windowSize: number = 11,
  polyOrder: number = 3
): number[] {
  if (data.length === 0) return [];

  let adjustedWindow = windowSize % 2 === 0 ? windowSize + 1 : windowSize;
  adjustedWindow = Math.max(adjustedWindow, polyOrder + 2);

  if (data.length < adjustedWindow) {
    return [...data];
  }

  const halfWindow = Math.floor(adjustedWindow / 2);

  // Extend signal with reflection at boundaries
  const extended: number[] = [];

  // Left reflection
  for (let i = halfWindow; i > 0; i--) {
    extended.push(data[Math.min(i, data.length - 1)]);
  }

  // Original data
  extended.push(...data);

  // Right reflection
  for (let i = 1; i <= halfWindow; i++) {
    extended.push(data[Math.max(0, data.length - 1 - i)]);
  }

  // Apply filter to extended signal
  const coefficients = computeSavgolCoefficients(adjustedWindow, polyOrder);
  const result: number[] = [];

  for (let i = halfWindow; i < extended.length - halfWindow; i++) {
    let sum = 0;
    for (let j = 0; j < adjustedWindow; j++) {
      sum += coefficients[j] * extended[i - halfWindow + j];
    }
    result.push(sum);
  }

  return result;
}
