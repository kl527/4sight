/**
 * Feature Extraction Module
 *
 * Comprehensive biosignal feature extraction for HRV analysis.
 */

// Types
export * from './types';

// Binary Decoding
export {
  decodePPG,
  decodePPGAsDouble,
  decodeAccel,
  decodeRollingPPG,
  decodeRollingAccel,
  isValidPPGData,
  isValidAccelData,
  expectedPPGSampleCount,
  expectedAccelSampleCount,
} from './binary-decoder';

// PPG Preprocessing
export {
  preprocessPPG,
  preprocessPPGFast,
  isValidPPGForProcessing,
  normalizePPG,
} from './ppg-preprocessing';

// RR Interval Extraction
export {
  findPeaks,
  extractRRIntervals,
  extractRRIntervalsWithDiagnostics,
  rrToHeartRate,
  successiveDifferences,
} from './rr-extraction';

// HRV Features
export {
  computeTimeDomainFeatures,
  computeBasicHRV,
  computeRMSSD,
  computeSDNN,
} from './hrv-features';

// Poincaré Features
export {
  computeNonLinearFeatures,
  computePoincareFeaturesFromRR,
  computePoincarePlotData,
} from './poincare-features';

// Accelerometer Features
export {
  computeAccelFeatures,
  computeAccelFeaturesFrom2D,
  computeBasicMovement,
} from './accel-features';

// Quality Assessment
export {
  computeQualityScore,
  getQualityCategory,
  isQualityAcceptable,
} from './quality-assessment';

// Main Feature Extractor
export {
  extract,
  extractFromArrays,
  extractWithDiagnostics,
  extractFromArraysWithDiagnostics,
  extractWithSignals,
} from './feature-extractor';

// Convenience namespace
import { extract, extractFromArrays, extractWithSignals } from './feature-extractor';
import { decodePPG, decodeAccel } from './binary-decoder';
import { preprocessPPG } from './ppg-preprocessing';
import { computeTimeDomainFeatures } from './hrv-features';
import { computeQualityScore } from './quality-assessment';

export const FeatureExtractor = {
  extract,
  extractFromArrays,
  extractWithSignals,
  decodePPG,
  decodeAccel,
  preprocessPPG,
  computeTimeDomainFeatures,
  computeQualityScore,
};
