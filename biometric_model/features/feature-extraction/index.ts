/**
 * Feature Extraction Module
 *
 * Comprehensive biosignal feature extraction for HRV analysis.
 *
 * Ported from: MaonV3/Services/FeatureExtractor.swift
 */

// Types
export * from './types';

// Binary Decoding
export {
  decodePPG,
  decodePPGAsDouble,
  decodeAccel,
  decodeTemp,
  decodeRollingPPG,
  decodeRollingAccel,
  isValidPPGData,
  isValidAccelData,
  isValidTempData,
  expectedPPGSampleCount,
  expectedAccelSampleCount,
  expectedTempSampleCount,
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
} from './feature-extractor';

// Convenience namespace
import { extract, extractFromArrays } from './feature-extractor';
import { decodePPG, decodeAccel, decodeTemp } from './binary-decoder';
import { preprocessPPG } from './ppg-preprocessing';
import { computeTimeDomainFeatures } from './hrv-features';
import { computeQualityScore } from './quality-assessment';

export const FeatureExtractor = {
  extract,
  extractFromArrays,
  decodePPG,
  decodeAccel,
  decodeTemp,
  preprocessPPG,
  computeTimeDomainFeatures,
  computeQualityScore,
};
