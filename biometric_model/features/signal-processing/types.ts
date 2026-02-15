/**
 * Signal Processing Types
 *
 * Type definitions for DSP configuration and results.
 *
 * Ported from: MaonV3/Services/FeatureExtractor.swift (config structs)
 */

// ============================================================================
// PPG PREPROCESSING CONFIGURATION
// ============================================================================

/**
 * Configuration for the PPG preprocessing pipeline.
 * Default values derived from MaonAnalysis/analysis/EDA.ipynb.
 */
export interface PPGPreprocessingConfig {
  // Hampel Filter (Spike Removal)
  /**
   * Window size for Hampel filter (should be odd).
   */
  hampelWindowSize: number;

  /**
   * Number of MADs for Hampel outlier threshold.
   */
  hampelSigma: number;

  /**
   * Maximum Hampel filter iterations.
   */
  hampelMaxIterations: number;

  // Gradient Spike Removal
  /**
   * Threshold factor for gradient-based spike detection.
   */
  gradientThresholdFactor: number;

  // Median Filter
  /**
   * Window size for median filter.
   */
  medianWindowSize: number;

  // Butterworth Filters
  /**
   * Highpass cutoff frequency (Hz) for baseline wander removal.
   */
  highpassCutoff: number;

  /**
   * Bandpass low cutoff frequency (Hz).
   */
  bandpassLowCutoff: number;

  /**
   * Bandpass high cutoff frequency (Hz).
   */
  bandpassHighCutoff: number;

  /**
   * Butterworth filter order.
   */
  butterworthOrder: number;

  // Savitzky-Golay Smoothing
  /**
   * Window size for Savitzky-Golay filter (should be odd).
   */
  savgolWindowSize: number;

  /**
   * Polynomial order for Savitzky-Golay filter.
   */
  savgolPolyOrder: number;

  // RR Interval Extraction
  /**
   * Minimum RR interval in ms (corresponds to max HR of 200 BPM).
   */
  minRRInterval: number;

  /**
   * Maximum RR interval in ms (corresponds to min HR of 30 BPM).
   */
  maxRRInterval: number;

  /**
   * Minimum peak distance factor (multiplied by sample rate).
   * 0.4 = 150 BPM max.
   */
  minPeakDistanceFactor: number;
}

/**
 * Default PPG preprocessing configuration with values from EDA.ipynb.
 */
export const DEFAULT_PPG_CONFIG: PPGPreprocessingConfig = {
  // Hampel Filter
  hampelWindowSize: 5,
  hampelSigma: 2.5,
  hampelMaxIterations: 3,

  // Gradient Spike Removal
  gradientThresholdFactor: 4.0,

  // Median Filter
  medianWindowSize: 3,

  // Butterworth Filters
  highpassCutoff: 0.3,
  bandpassLowCutoff: 0.5,
  bandpassHighCutoff: 4.0,
  butterworthOrder: 2,

  // Savitzky-Golay
  savgolWindowSize: 7,
  savgolPolyOrder: 2,

  // RR Interval Extraction
  minRRInterval: 300, // 200 BPM max
  maxRRInterval: 2000, // 30 BPM min
  minPeakDistanceFactor: 0.4, // 150 BPM max
};

// ============================================================================
// ACCELEROMETER PREPROCESSING CONFIGURATION
// ============================================================================

/**
 * Configuration for accelerometer preprocessing.
 */
export interface AccelPreprocessingConfig {
  /**
   * Window size for Hampel filter.
   */
  hampelWindowSize: number;

  /**
   * Number of MADs for Hampel outlier threshold.
   */
  hampelSigma: number;

  /**
   * Maximum Hampel filter iterations.
   */
  hampelMaxIterations: number;

  /**
   * Window size for median filter.
   */
  medianWindowSize: number;
}

/**
 * Default accelerometer preprocessing configuration.
 */
export const DEFAULT_ACCEL_CONFIG: AccelPreprocessingConfig = {
  hampelWindowSize: 7,
  hampelSigma: 2.5,
  hampelMaxIterations: 2,
  medianWindowSize: 3,
};

// ============================================================================
// QUALITY SCORE CONFIGURATION
// ============================================================================

/**
 * Configuration for signal quality score calculation.
 * Weights must sum to 1.0.
 */
export interface QualityScoreConfig {
  // Component Weights
  /**
   * Weight for PPG amplitude IQR component.
   */
  iqrWeight: number;

  /**
   * Weight for peak detection success component.
   */
  peakDetectionWeight: number;

  /**
   * Weight for RR interval validity ratio component.
   */
  rrValidityWeight: number;

  /**
   * Weight for motion artifact (inverse accel variability) component.
   */
  motionArtifactWeight: number;

  // Thresholds
  /**
   * Minimum IQR ratio for non-zero score.
   */
  minIQRRatio: number;

  /**
   * Expected IQR normalization value.
   */
  iqrNormalizationValue: number;

  /**
   * Minimum expected peaks for "good" signal (30s window).
   */
  expectedMinPeaks: number;

  /**
   * Maximum expected peaks for "good" signal (30s window).
   */
  expectedMaxPeaks: number;

  /**
   * Accelerometer std threshold for motion penalty (g-units).
   */
  motionStdThreshold: number;
}

/**
 * Default quality score configuration with equal weights.
 */
export const DEFAULT_QUALITY_CONFIG: QualityScoreConfig = {
  // Weights (must sum to 1.0)
  iqrWeight: 0.25,
  peakDetectionWeight: 0.25,
  rrValidityWeight: 0.25,
  motionArtifactWeight: 0.25,

  // Thresholds
  minIQRRatio: 0.1,
  iqrNormalizationValue: 0.5,
  expectedMinPeaks: 20,
  expectedMaxPeaks: 60,
  motionStdThreshold: 0.2,
};

/**
 * Validate that quality score weights sum to 1.0.
 */
export function isValidQualityConfig(config: QualityScoreConfig): boolean {
  const sum =
    config.iqrWeight +
    config.peakDetectionWeight +
    config.rrValidityWeight +
    config.motionArtifactWeight;
  return Math.abs(sum - 1.0) < 0.001;
}

// ============================================================================
// FILTER RESULT TYPES
// ============================================================================

/**
 * Result from Hampel filter.
 */
export interface HampelFilterResult {
  /**
   * Filtered signal with outliers replaced.
   */
  filtered: number[];

  /**
   * Indices of detected outliers.
   */
  outlierIndices: number[];
}

/**
 * Result from gradient spike removal.
 */
export interface GradientSpikeResult {
  /**
   * Filtered signal with spikes removed.
   */
  filtered: number[];

  /**
   * Boolean mask indicating spike locations.
   */
  spikeMask: boolean[];
}

/**
 * Result from clipping detection.
 */
export interface ClippingFixResult {
  /**
   * Fixed signal with clipped regions interpolated.
   */
  fixed: number[];

  /**
   * Boolean mask indicating clipped regions.
   */
  clippedMask: boolean[];
}

// ============================================================================
// BUTTERWORTH FILTER TYPES
// ============================================================================

/**
 * IIR filter coefficients (b = numerator, a = denominator).
 */
export interface FilterCoefficients {
  b: number[];
  a: number[];
}
