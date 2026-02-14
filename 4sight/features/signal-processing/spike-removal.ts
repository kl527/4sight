/**
 * Spike Removal
 *
 * Gradient-based spike detection and removal.
 */
import { median } from './statistics';
import { fillGaps } from './interpolation';
import type { GradientSpikeResult } from './types';

/**
 * Remove spikes based on unusually large gradients.
 *
 * Spikes have very large first derivatives. This detects points where
 * the gradient exceeds `thresholdFactor × median_gradient`.
 *
 * @param data Input signal
 * @param thresholdFactor Multiplier for median gradient threshold (default: 5.0)
 * @returns Object with filtered signal and spike mask
 */
export function gradientSpikeRemoval(
  data: number[],
  thresholdFactor: number = 5.0
): GradientSpikeResult {
  if (data.length <= 1) {
    return {
      filtered: [...data],
      spikeMask: new Array(data.length).fill(false),
    };
  }

  const result = [...data];
  const spikeMask = new Array(data.length).fill(false);

  // Compute first derivative (absolute gradient)
  const gradient: number[] = [0]; // First element has zero gradient
  for (let i = 1; i < data.length; i++) {
    gradient.push(Math.abs(data[i] - data[i - 1]));
  }

  // Threshold based on median gradient
  const medianGrad = median(gradient);
  const threshold = medianGrad * thresholdFactor;

  // Find spike locations
  const spikeIndices: number[] = [];
  for (let i = 0; i < gradient.length; i++) {
    if (gradient[i] > threshold) {
      spikeMask[i] = true;
      spikeIndices.push(i);
    }
  }

  // Interpolate spike locations if we have enough good data
  if (spikeIndices.length > 0) {
    const goodIndices: number[] = [];
    const goodValues: number[] = [];

    for (let i = 0; i < data.length; i++) {
      if (!spikeMask[i]) {
        goodIndices.push(i);
        goodValues.push(data[i]);
      }
    }

    if (goodIndices.length > 1) {
      // Use fillGaps to interpolate spike locations
      const filled = fillGaps(data, spikeMask);
      return { filtered: filled, spikeMask };
    }
  }

  return { filtered: result, spikeMask };
}

/**
 * Detect spikes using second derivative (acceleration).
 *
 * @param data Input signal
 * @param thresholdFactor Multiplier for median threshold (default: 5.0)
 * @returns Boolean mask where true indicates spike
 */
export function detectSpikesSecondDerivative(
  data: number[],
  thresholdFactor: number = 5.0
): boolean[] {
  if (data.length <= 2) {
    return new Array(data.length).fill(false);
  }

  // Compute second derivative
  const secondDeriv: number[] = [0]; // First element
  for (let i = 1; i < data.length - 1; i++) {
    secondDeriv.push(Math.abs(data[i - 1] - 2 * data[i] + data[i + 1]));
  }
  secondDeriv.push(0); // Last element

  // Threshold based on median
  const medianSD = median(secondDeriv);
  const threshold = medianSD * thresholdFactor;

  // Mark spikes
  const mask = new Array(data.length).fill(false);
  for (let i = 0; i < secondDeriv.length; i++) {
    if (secondDeriv[i] > threshold) {
      mask[i] = true;
    }
  }

  return mask;
}

/**
 * Combined spike removal using both gradient and second derivative.
 *
 * @param data Input signal
 * @param gradientThreshold Threshold factor for gradient method (default: 5.0)
 * @param secondDerivThreshold Threshold factor for second derivative method (default: 5.0)
 * @returns Object with filtered signal and combined spike mask
 */
export function combinedSpikeRemoval(
  data: number[],
  gradientThreshold: number = 5.0,
  secondDerivThreshold: number = 5.0
): GradientSpikeResult {
  const { spikeMask: gradientMask } = gradientSpikeRemoval(data, gradientThreshold);
  const secondDerivMask = detectSpikesSecondDerivative(data, secondDerivThreshold);

  // Combine masks (OR operation - spike if detected by either method)
  const combinedMask = gradientMask.map((v, i) => v || secondDerivMask[i]);

  // Interpolate combined spike locations
  const filtered = fillGaps(data, combinedMask);

  return { filtered, spikeMask: combinedMask };
}
