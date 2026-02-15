/**
 * Signal Processing Module
 *
 * Core DSP utilities for biosignal preprocessing.
 *
 * Ported from: MaonV3/Services/SignalProcessing.swift
 */

// Types
export * from './types';

// Statistics
export {
  mean,
  std,
  sampleStd,
  median,
  iqr,
  percentile,
  q1,
  q3,
  min,
  max,
  range,
  sum,
  rms,
  variance,
  mad,
  normalize,
} from './statistics';

// Interpolation
export {
  lerp,
  linearInterpolate,
  interpolateMultiple,
  fillGaps,
  resample,
} from './interpolation';

// Filters
export { medianFilter, weightedMedianFilter } from './filters/median';
export { hampelFilter, iterativeHampel, detectOutliers } from './filters/hampel';
export { savgolFilter, savgolFilterWithEdges } from './filters/savgol';
export {
  butterworthLowpass,
  butterworthHighpass,
  butterworthBandpass,
  filtfilt,
  lfilter,
  lfilterWithZi,
} from './filters/butterworth';

// Spike Removal
export {
  gradientSpikeRemoval,
  detectSpikesSecondDerivative,
  combinedSpikeRemoval,
} from './spike-removal';

// Clipping
export {
  fixClipping,
  detectFlatRegions,
  fixFlatRegions,
  fixClippingCombined,
} from './clipping';

// Convenience re-exports of common utilities
import { mean, std, median, normalize } from './statistics';
import { medianFilter } from './filters/median';
import { iterativeHampel } from './filters/hampel';
import { savgolFilter } from './filters/savgol';
import { butterworthBandpass, butterworthHighpass } from './filters/butterworth';
import { gradientSpikeRemoval } from './spike-removal';
import { fixClipping } from './clipping';

/**
 * Signal Processing utilities namespace for cleaner imports.
 */
export const SignalProcessing = {
  // Statistics
  mean,
  std,
  median,
  normalize,

  // Filters
  medianFilter,
  iterativeHampel,
  savgolFilter,
  butterworthBandpass,
  butterworthHighpass,

  // Cleaning
  gradientSpikeRemoval,
  fixClipping,
};
