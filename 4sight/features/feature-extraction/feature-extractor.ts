/**
 * Feature Extractor
 *
 * Main orchestrator for biosignal feature extraction.
 */
import type { PPGPreprocessingConfig, AccelPreprocessingConfig, QualityScoreConfig } from '@/features/signal-processing/types';
import { DEFAULT_PPG_CONFIG, DEFAULT_ACCEL_CONFIG, DEFAULT_QUALITY_CONFIG } from '@/features/signal-processing/types';
import { PPGConfig, AccelConfig } from '@/constants/sensor';

import type { BiosignalFeatures, RRResult, ExtractionFailureReason, TimeDomainFeatures, NonLinearFeatures, AccelFeatures, WindowExtractionResult } from './types';
import { getFailureDescription } from './types';
import { decodePPGAsDouble, decodeAccel } from './binary-decoder';
import { preprocessPPG, isValidPPGForProcessing } from './ppg-preprocessing';
import { findPeaks, extractRRIntervalsWithDiagnostics, rrToHeartRate } from './rr-extraction';
import { computeTimeDomainFeatures } from './hrv-features';
import { computeNonLinearFeatures } from './poincare-features';
import { computeAccelFeatures } from './accel-features';
import { computeQualityScore } from './quality-assessment';

// ============================================================================
// MAIN EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract all biosignal features from raw binary data.
 *
 * @param ppgData Raw PPG binary data
 * @param accelData Raw accelerometer binary data
 * @param windowId Unique identifier for this window
 * @param timestamp Window start timestamp (ms since epoch)
 * @param ppgConfig PPG preprocessing configuration
 * @param accelConfig Accelerometer preprocessing configuration
 * @param qualityConfig Quality score configuration
 * @returns Extracted features, or null if extraction fails
 */
export function extract(
  ppgData: Uint8Array,
  accelData: Uint8Array,
  windowId: string,
  timestamp: number,
  ppgConfig: PPGPreprocessingConfig = DEFAULT_PPG_CONFIG,
  accelConfig: AccelPreprocessingConfig = DEFAULT_ACCEL_CONFIG,
  qualityConfig: QualityScoreConfig = DEFAULT_QUALITY_CONFIG
): BiosignalFeatures | null {
  const { features, failureReason } = extractWithDiagnostics(
    ppgData,
    accelData,
    windowId,
    timestamp,
    ppgConfig,
    accelConfig,
    qualityConfig
  );

  if (features === null && failureReason) {
    console.warn(`Feature extraction failed for ${windowId}: ${getFailureDescription(failureReason)}`);
  }

  return features;
}

/**
 * Extract features from in-memory arrays (for real-time arousal windows from BLE).
 *
 * @param ppg PPG samples as numbers
 * @param accel Accelerometer samples as [[x, y, z], ...]
 * @param ppgHz PPG sample rate (default 25 Hz)
 * @param accelHz Accelerometer sample rate (default 12.5 Hz)
 * @param windowId Unique identifier for this window
 * @param timestamp Window timestamp (ms since epoch)
 * @param ppgConfig PPG preprocessing configuration
 * @param accelConfig Accelerometer preprocessing configuration
 * @param qualityConfig Quality score configuration
 * @returns Extracted features, or null if extraction fails
 */
export function extractFromArrays(
  ppg: number[],
  accel: number[][],
  ppgHz: number = 25.0,
  accelHz: number = 12.5,
  windowId: string,
  timestamp: number,
  ppgConfig: PPGPreprocessingConfig = DEFAULT_PPG_CONFIG,
  accelConfig: AccelPreprocessingConfig = DEFAULT_ACCEL_CONFIG,
  qualityConfig: QualityScoreConfig = DEFAULT_QUALITY_CONFIG
): BiosignalFeatures | null {
  const { features, failureReason } = extractFromArraysWithDiagnostics(
    ppg,
    accel,
    ppgHz,
    accelHz,
    windowId,
    timestamp,
    ppgConfig,
    accelConfig,
    qualityConfig
  );

  if (features === null && failureReason) {
    console.warn(`Feature extraction failed for ${windowId}: ${getFailureDescription(failureReason)}`);
  }

  return features;
}

// ============================================================================
// EXTRACTION WITH DIAGNOSTICS
// ============================================================================

/**
 * Extract features with detailed diagnostics on failure.
 */
export function extractWithDiagnostics(
  ppgData: Uint8Array,
  accelData: Uint8Array,
  windowId: string,
  timestamp: number,
  ppgConfig: PPGPreprocessingConfig = DEFAULT_PPG_CONFIG,
  accelConfig: AccelPreprocessingConfig = DEFAULT_ACCEL_CONFIG,
  qualityConfig: QualityScoreConfig = DEFAULT_QUALITY_CONFIG
): { features: BiosignalFeatures | null; failureReason: ExtractionFailureReason | null } {
  // 1. Decode binary data
  const { samples: ppgSamples } = decodePPGAsDouble(ppgData);
  const { x: accelX, y: accelY, z: accelZ } = decodeAccel(accelData);

  // Track what data we have
  const hasPPG = ppgSamples.length > 0 && isValidPPGForProcessing(ppgSamples);
  const hasAccel = accelX.length > 0;

  // Variables to hold computed features
  let timeDomain: TimeDomainFeatures | null = null;
  let nonLinear: NonLinearFeatures | null = null;
  let rrResult: RRResult | null = null;
  let preprocessedPPG: number[] = [];

  // 2. Process PPG if available
  if (hasPPG) {
    preprocessedPPG = preprocessPPG(ppgSamples, PPGConfig.SAMPLE_RATE_HZ, ppgConfig);

    const rrExtraction = extractRRIntervalsWithDiagnostics(
      preprocessedPPG,
      PPGConfig.SAMPLE_RATE_HZ,
      ppgConfig
    );

    if (rrExtraction.result) {
      rrResult = rrExtraction.result;
      timeDomain = computeTimeDomainFeatures(rrResult.validRR);
      nonLinear = computeNonLinearFeatures(timeDomain.sdnn, timeDomain.sdsd);
    }
  }

  // 3. Compute accelerometer features if available
  let accelFeatures: AccelFeatures | null = null;
  if (hasAccel) {
    accelFeatures = computeAccelFeatures(accelX, accelY, accelZ, AccelConfig.SAMPLE_RATE_HZ, accelConfig);
  }

  // 4. Compute signal quality score
  const qualityScore = computeQualityScore(
    hasPPG ? ppgSamples : null,
    hasPPG ? preprocessedPPG : null,
    rrResult,
    accelFeatures?.magnitudeStd ?? null,
    qualityConfig
  );

  // 6. Calculate duration
  let durationMs: number;
  if (ppgSamples.length > 0) {
    durationMs = Math.floor((ppgSamples.length / PPGConfig.SAMPLE_RATE_HZ) * 1000);
  } else if (accelX.length > 0) {
    durationMs = Math.floor((accelX.length / AccelConfig.SAMPLE_RATE_HZ) * 1000);
  } else {
    durationMs = 0;
  }

  const features = buildFeatures(
    timeDomain,
    nonLinear,
    accelFeatures,
    ppgSamples.length,
    accelX.length,
    rrResult,
    qualityScore,
    windowId,
    timestamp,
    durationMs
  );

  return { features, failureReason: null };
}

/**
 * Extract features from arrays with detailed diagnostics.
 */
export function extractFromArraysWithDiagnostics(
  ppgSamples: number[],
  accel: number[][],
  ppgHz: number = 25.0,
  accelHz: number = 12.5,
  windowId: string,
  timestamp: number,
  ppgConfig: PPGPreprocessingConfig = DEFAULT_PPG_CONFIG,
  accelConfig: AccelPreprocessingConfig = DEFAULT_ACCEL_CONFIG,
  qualityConfig: QualityScoreConfig = DEFAULT_QUALITY_CONFIG
): { features: BiosignalFeatures | null; failureReason: ExtractionFailureReason | null } {
  // Separate accel into x, y, z arrays
  const accelX: number[] = [];
  const accelY: number[] = [];
  const accelZ: number[] = [];
  for (const sample of accel) {
    if (sample.length >= 3) {
      accelX.push(sample[0]);
      accelY.push(sample[1]);
      accelZ.push(sample[2]);
    }
  }

  // Track what data we have
  const hasPPG = ppgSamples.length > 0 && isValidPPGForProcessing(ppgSamples);
  const hasAccel = accelX.length > 0;

  // Variables to hold computed features
  let timeDomain: TimeDomainFeatures | null = null;
  let nonLinear: NonLinearFeatures | null = null;
  let rrResult: RRResult | null = null;
  let preprocessedPPG: number[] = [];

  // Process PPG if available
  if (hasPPG) {
    preprocessedPPG = preprocessPPG(ppgSamples, ppgHz, ppgConfig);

    const rrExtraction = extractRRIntervalsWithDiagnostics(preprocessedPPG, ppgHz, ppgConfig);

    if (rrExtraction.result) {
      rrResult = rrExtraction.result;
      timeDomain = computeTimeDomainFeatures(rrResult.validRR);
      nonLinear = computeNonLinearFeatures(timeDomain.sdnn, timeDomain.sdsd);
    }
  }

  // Compute accelerometer features
  let accelFeatures: AccelFeatures | null = null;
  if (hasAccel) {
    accelFeatures = computeAccelFeatures(accelX, accelY, accelZ, accelHz, accelConfig);
  }

  // Compute signal quality score
  const qualityScore = computeQualityScore(
    hasPPG ? ppgSamples : null,
    hasPPG ? preprocessedPPG : null,
    rrResult,
    accelFeatures?.magnitudeStd ?? null,
    qualityConfig
  );

  // Calculate duration
  let durationMs: number;
  if (ppgSamples.length > 0) {
    durationMs = Math.floor((ppgSamples.length / ppgHz) * 1000);
  } else if (accelX.length > 0) {
    durationMs = Math.floor((accelX.length / accelHz) * 1000);
  } else {
    durationMs = 0;
  }

  const features = buildFeatures(
    timeDomain,
    nonLinear,
    accelFeatures,
    ppgSamples.length,
    accelX.length,
    rrResult,
    qualityScore,
    windowId,
    timestamp,
    durationMs
  );

  return { features, failureReason: null };
}

// ============================================================================
// EXTRACTION WITH INTERMEDIATE SIGNALS (for visualization)
// ============================================================================

/**
 * Extract features AND return intermediate signal data for graphing.
 *
 * Same pipeline as extractWithDiagnostics but retains decoded samples,
 * preprocessed PPG, peak indices, RR intervals, and heart rates.
 */
export function extractWithSignals(
  ppgData: Uint8Array,
  accelData: Uint8Array,
  windowId: string,
  timestamp: number,
  ppgConfig: PPGPreprocessingConfig = DEFAULT_PPG_CONFIG,
  accelConfig: AccelPreprocessingConfig = DEFAULT_ACCEL_CONFIG,
  qualityConfig: QualityScoreConfig = DEFAULT_QUALITY_CONFIG
): WindowExtractionResult {
  // 1. Decode binary data
  const { samples: ppgSamples } = decodePPGAsDouble(ppgData);
  const { x: accelX, y: accelY, z: accelZ } = decodeAccel(accelData);

  const hasPPG = ppgSamples.length > 0 && isValidPPGForProcessing(ppgSamples);
  const hasAccel = accelX.length > 0;

  let timeDomain: TimeDomainFeatures | null = null;
  let nonLinear: NonLinearFeatures | null = null;
  let rrResult: RRResult | null = null;
  let preprocessedPPG: number[] = [];
  let peakIndices: number[] = [];

  // 2. Process PPG
  if (hasPPG) {
    preprocessedPPG = preprocessPPG(ppgSamples, PPGConfig.SAMPLE_RATE_HZ, ppgConfig);

    const minDistance = Math.floor(PPGConfig.SAMPLE_RATE_HZ * ppgConfig.minPeakDistanceFactor);
    peakIndices = findPeaks(preprocessedPPG, minDistance);

    const rrExtraction = extractRRIntervalsWithDiagnostics(
      preprocessedPPG,
      PPGConfig.SAMPLE_RATE_HZ,
      ppgConfig
    );

    if (rrExtraction.result) {
      rrResult = rrExtraction.result;
      timeDomain = computeTimeDomainFeatures(rrResult.validRR);
      nonLinear = computeNonLinearFeatures(timeDomain.sdnn, timeDomain.sdsd);
    }
  }

  // 3. Compute accelerometer features
  let accelFeatures: AccelFeatures | null = null;
  if (hasAccel) {
    accelFeatures = computeAccelFeatures(accelX, accelY, accelZ, AccelConfig.SAMPLE_RATE_HZ, accelConfig);
  }

  // 4. Quality score
  const qualityScore = computeQualityScore(
    hasPPG ? ppgSamples : null,
    hasPPG ? preprocessedPPG : null,
    rrResult,
    accelFeatures?.magnitudeStd ?? null,
    qualityConfig
  );

  // 5. Duration
  let durationMs: number;
  if (ppgSamples.length > 0) {
    durationMs = Math.floor((ppgSamples.length / PPGConfig.SAMPLE_RATE_HZ) * 1000);
  } else if (accelX.length > 0) {
    durationMs = Math.floor((accelX.length / AccelConfig.SAMPLE_RATE_HZ) * 1000);
  } else {
    durationMs = 0;
  }

  const features = buildFeatures(
    timeDomain,
    nonLinear,
    accelFeatures,
    ppgSamples.length,
    accelX.length,
    rrResult,
    qualityScore,
    windowId,
    timestamp,
    durationMs
  );

  return {
    windowId,
    timestamp,
    features,
    rawPPG: ppgSamples,
    preprocessedPPG,
    accelX,
    accelY,
    accelZ,
    rrIntervals: rrResult?.validRR ?? [],
    heartRates: rrResult ? rrToHeartRate(rrResult.validRR) : [],
    peakIndices,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildFeatures(
  timeDomain: TimeDomainFeatures | null,
  nonLinear: NonLinearFeatures | null,
  accelFeatures: AccelFeatures | null,
  ppgSampleCount: number,
  accelSampleCount: number,
  rrResult: RRResult | null,
  qualityScore: number,
  windowId: string,
  timestamp: number,
  durationMs: number
): BiosignalFeatures {
  return {
    // Time domain (null if PPG missing/insufficient)
    hrMean: timeDomain?.hrMean ?? null,
    hrStd: timeDomain?.hrStd ?? null,
    hrMin: timeDomain?.hrMin ?? null,
    hrMax: timeDomain?.hrMax ?? null,
    meanRR: timeDomain?.meanRR ?? null,
    sdnn: timeDomain?.sdnn ?? null,
    rmssd: timeDomain?.rmssd ?? null,
    sdsd: timeDomain?.sdsd ?? null,
    pnn50: timeDomain?.pnn50 ?? null,
    pnn20: timeDomain?.pnn20 ?? null,
    cvnn: timeDomain?.cvnn ?? null,
    cvsd: timeDomain?.cvsd ?? null,
    medianRR: timeDomain?.medianRR ?? null,
    rangeRR: timeDomain?.rangeRR ?? null,
    iqrRR: timeDomain?.iqrRR ?? null,

    // Non-linear (null if PPG missing/insufficient)
    sd1: nonLinear?.sd1 ?? null,
    sd2: nonLinear?.sd2 ?? null,
    sd1sd2: nonLinear?.sd1sd2 ?? null,
    poincareArea: nonLinear?.area ?? null,

    // Accelerometer (null if accel missing)
    accelMeanX: accelFeatures?.meanX ?? null,
    accelMeanY: accelFeatures?.meanY ?? null,
    accelMeanZ: accelFeatures?.meanZ ?? null,
    accelStdX: accelFeatures?.stdX ?? null,
    accelStdY: accelFeatures?.stdY ?? null,
    accelStdZ: accelFeatures?.stdZ ?? null,
    accelMagnitudeMean: accelFeatures?.magnitudeMean ?? null,
    accelMagnitudeStd: accelFeatures?.magnitudeStd ?? null,
    accelMagnitudeMax: accelFeatures?.magnitudeMax ?? null,
    movementIntensity: accelFeatures?.intensity ?? null,
    accelEnergy: accelFeatures?.energy ?? null,

    // Quality
    ppgSampleCount,
    accelSampleCount,
    peakCount: rrResult?.peakCount ?? null,
    validRRCount: rrResult?.validRR.length ?? null,
    qualityScore,

    // Metadata
    windowId,
    timestamp,
    durationMs,
  };
}
