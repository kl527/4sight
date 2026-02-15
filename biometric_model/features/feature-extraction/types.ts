/**
 * Feature Extraction Types
 *
 * Type definitions for biosignal features and extraction results.
 *
 * Ported from: MaonV3/Services/FeatureExtractor.swift
 */

// ============================================================================
// BIOSIGNAL FEATURES
// ============================================================================

/**
 * Complete set of extracted biosignal features.
 * Features are optional when the corresponding sensor data is missing.
 */
export interface BiosignalFeatures {
  // ========== Time Domain HRV (15 features) ==========
  // nil when PPG data is missing/insufficient

  /** Mean heart rate (BPM) */
  hrMean: number | null;
  /** Heart rate standard deviation */
  hrStd: number | null;
  /** Minimum heart rate (BPM) */
  hrMin: number | null;
  /** Maximum heart rate (BPM) */
  hrMax: number | null;
  /** Mean RR interval (ms) */
  meanRR: number | null;
  /** Standard deviation of RR intervals (SDNN) (ms) */
  sdnn: number | null;
  /** Root mean square of successive differences (RMSSD) (ms) */
  rmssd: number | null;
  /** Standard deviation of successive differences (SDSD) (ms) */
  sdsd: number | null;
  /** Percentage of successive RR differences > 50ms */
  pnn50: number | null;
  /** Percentage of successive RR differences > 20ms */
  pnn20: number | null;
  /** Coefficient of variation of RR intervals (SDNN/meanRR) */
  cvnn: number | null;
  /** Coefficient of variation of successive differences (RMSSD/meanRR) */
  cvsd: number | null;
  /** Median RR interval (ms) */
  medianRR: number | null;
  /** Range of RR intervals (max - min) (ms) */
  rangeRR: number | null;
  /** Interquartile range of RR intervals (ms) */
  iqrRR: number | null;

  // ========== Non-Linear / Poincaré (4 features) ==========
  // nil when PPG data is missing/insufficient

  /** Short-term HRV (Poincaré SD1) */
  sd1: number | null;
  /** Long-term HRV (Poincaré SD2) */
  sd2: number | null;
  /** SD1/SD2 ratio */
  sd1sd2: number | null;
  /** Poincaré ellipse area (π × SD1 × SD2) */
  poincareArea: number | null;

  // ========== Accelerometer (11 features) ==========
  // nil when accel data is missing

  /** Mean X-axis acceleration (g) */
  accelMeanX: number | null;
  /** Mean Y-axis acceleration (g) */
  accelMeanY: number | null;
  /** Mean Z-axis acceleration (g) */
  accelMeanZ: number | null;
  /** Standard deviation of X-axis (g) */
  accelStdX: number | null;
  /** Standard deviation of Y-axis (g) */
  accelStdY: number | null;
  /** Standard deviation of Z-axis (g) */
  accelStdZ: number | null;
  /** Mean magnitude sqrt(x² + y² + z²) (g) */
  accelMagnitudeMean: number | null;
  /** Standard deviation of magnitude (g) */
  accelMagnitudeStd: number | null;
  /** Maximum magnitude (g) */
  accelMagnitudeMax: number | null;
  /** Movement intensity (variance of magnitude) */
  movementIntensity: number | null;
  /** Total energy (sum of squared magnitudes) */
  accelEnergy: number | null;

  // ========== Temperature (1 feature) ==========
  // nil when temp data is missing

  /** Mean skin temperature (°C) */
  tempMean: number | null;

  // ========== Quality Metrics (5 features) ==========

  /** Number of PPG samples in window */
  ppgSampleCount: number;
  /** Number of accelerometer samples in window */
  accelSampleCount: number;
  /** Number of detected heartbeat peaks (null if PPG missing) */
  peakCount: number | null;
  /** Number of valid RR intervals after filtering (null if PPG missing) */
  validRRCount: number | null;
  /** Signal quality score (0-1, higher = better) */
  qualityScore: number;

  // ========== Metadata ==========

  /** Unique window identifier */
  windowId: string;
  /** Window start timestamp (ms since epoch) */
  timestamp: number;
  /** Window duration (ms) */
  durationMs: number;
}

/**
 * Check if HRV features are available.
 */
export function hasHRVFeatures(features: BiosignalFeatures): boolean {
  return features.hrMean !== null;
}

/**
 * Check if accelerometer features are available.
 */
export function hasAccelFeatures(features: BiosignalFeatures): boolean {
  return features.accelMeanX !== null;
}

/**
 * Check if temperature feature is available.
 */
export function hasTempFeature(features: BiosignalFeatures): boolean {
  return features.tempMean !== null;
}

// ============================================================================
// INTERNAL FEATURE STRUCTURES
// ============================================================================

/**
 * Time-domain HRV features (internal).
 */
export interface TimeDomainFeatures {
  hrMean: number;
  hrStd: number;
  hrMin: number;
  hrMax: number;
  meanRR: number;
  sdnn: number;
  rmssd: number;
  sdsd: number;
  pnn50: number;
  pnn20: number;
  cvnn: number;
  cvsd: number;
  medianRR: number;
  rangeRR: number;
  iqrRR: number;
}

/**
 * Non-linear / Poincaré features (internal).
 */
export interface NonLinearFeatures {
  sd1: number;
  sd2: number;
  sd1sd2: number;
  area: number;
}

/**
 * Accelerometer features (internal).
 */
export interface AccelFeatures {
  meanX: number;
  meanY: number;
  meanZ: number;
  stdX: number;
  stdY: number;
  stdZ: number;
  magnitudeMean: number;
  magnitudeStd: number;
  magnitudeMax: number;
  intensity: number;
  energy: number;
}

// ============================================================================
// RR INTERVAL EXTRACTION
// ============================================================================

/**
 * Result from RR interval extraction.
 */
export interface RRResult {
  /** Valid RR intervals in milliseconds */
  validRR: number[];
  /** Number of detected peaks */
  peakCount: number;
  /** Number of outlier RR intervals removed */
  outlierCount: number;
}

/**
 * Reason why feature extraction failed.
 */
export type ExtractionFailureReason =
  | { type: 'emptyPPGData' }
  | { type: 'allZeroPPG' }
  | { type: 'insufficientPeaks'; found: number; required: number }
  | { type: 'insufficientValidRR'; found: number; required: number };

/**
 * Get human-readable description of failure reason.
 */
export function getFailureDescription(reason: ExtractionFailureReason): string {
  switch (reason.type) {
    case 'emptyPPGData':
      return 'PPG data is empty';
    case 'allZeroPPG':
      return 'PPG samples are all zeros';
    case 'insufficientPeaks':
      return `Insufficient peaks: found ${reason.found}, need ${reason.required}`;
    case 'insufficientValidRR':
      return `Insufficient valid RR intervals: found ${reason.found}, need ${reason.required}`;
  }
}

// ============================================================================
// BINARY DECODER TYPES
// ============================================================================

/**
 * Decoded PPG data.
 */
export interface DecodedPPG {
  /** Timestamps for each sample (ms since epoch) */
  timestamps: number[];
  /** PPG sample values (raw uint16) */
  samples: number[];
}

/**
 * Decoded accelerometer data.
 */
export interface DecodedAccel {
  /** Timestamps for each sample (ms since epoch) */
  timestamps: number[];
  /** X-axis values in g-units */
  x: number[];
  /** Y-axis values in g-units */
  y: number[];
  /** Z-axis values in g-units */
  z: number[];
}

/**
 * Decoded temperature data.
 */
export interface DecodedTemp {
  /** Timestamps for each sample (ms since epoch) */
  timestamps: number[];
  /** Temperature values in Celsius */
  temps: number[];
}

// ============================================================================
// AROUSAL WINDOW TYPES
// ============================================================================

/**
 * Header metadata for binary arousal window transfer.
 */
export interface ArousalWindowHeader {
  currentHR: number;
  baselineHR: number;
  threshold: number;
  ppgLen: number;
  accelLen: number;
  ppgCount: number;
  accelCount: number;
  temp: number | null;
  ppgHz: number;
  accelHz: number;
}

/**
 * Result of processing an arousal window.
 */
export interface ArousalResult {
  /** Whether to trigger a calm intervention */
  shouldIntervene: boolean;
  /** The baseline HR used for threshold calculation */
  baselineHR: number;
  /** Arousal classification ('high' or 'low') */
  arousal: 'high' | 'low';
  /** Confidence in the arousal classification (0-1) */
  confidence: number;
  /** Extracted features (if extraction succeeded) */
  features: BiosignalFeatures | null;
}
