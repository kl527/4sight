/**
 * Quality Assessment
 *
 * Signal quality score calculation for biosignal data.
 *
 * Ported from: MaonV3/Services/FeatureExtractor.swift
 */

import { iqr, min } from '../signal-processing';
import type { QualityScoreConfig } from '../signal-processing/types';
import { DEFAULT_QUALITY_CONFIG } from '../signal-processing/types';
import type { RRResult } from './types';

/**
 * Compute signal quality score (0-1).
 *
 * Based on E2E-PPG SQA methodology:
 * - IQR of PPG amplitude
 * - Peak detection success rate
 * - RR interval plausibility
 * - Motion artifact indicator
 *
 * Handles missing sensor data by adjusting weights proportionally.
 *
 * @param ppgSamples Raw PPG samples (null if PPG missing)
 * @param preprocessedPPG Preprocessed PPG signal (null if PPG missing)
 * @param rrResult RR interval extraction result (null if PPG missing/insufficient)
 * @param accelMagnitudeStd Standard deviation of accelerometer magnitude (null if accel missing)
 * @param config Quality score configuration
 * @returns Quality score between 0 and 1 (higher = better)
 */
export function computeQualityScore(
  ppgSamples: number[] | null,
  preprocessedPPG: number[] | null,
  rrResult: RRResult | null,
  accelMagnitudeStd: number | null,
  config: QualityScoreConfig = DEFAULT_QUALITY_CONFIG
): number {
  let score = 0.0;
  let totalWeight = 0.0;

  // 1. PPG amplitude variability (IQR-based)
  if (preprocessedPPG && preprocessedPPG.length > 0) {
    const ppgIQR = iqr(preprocessedPPG);
    const normalizedIQR = min([ppgIQR / config.iqrNormalizationValue, 1.0]);
    const iqrScore = normalizedIQR > config.minIQRRatio ? normalizedIQR : 0.0;
    score += config.iqrWeight * iqrScore;
    totalWeight += config.iqrWeight;
  }

  // 2. Peak detection success
  if (rrResult) {
    const peakCount = rrResult.peakCount;
    let peakScore: number;
    if (peakCount >= config.expectedMinPeaks && peakCount <= config.expectedMaxPeaks) {
      peakScore = 1.0;
    } else if (peakCount > 0) {
      peakScore = 0.5;
    } else {
      peakScore = 0.0;
    }
    score += config.peakDetectionWeight * peakScore;
    totalWeight += config.peakDetectionWeight;

    // 3. RR interval validity ratio
    const totalRR = rrResult.validRR.length + rrResult.outlierCount;
    const validityRatio = totalRR > 0 ? rrResult.validRR.length / totalRR : 0;
    score += config.rrValidityWeight * validityRatio;
    totalWeight += config.rrValidityWeight;
  }

  // 4. Motion artifact indicator (inverse of accel variability)
  if (accelMagnitudeStd !== null) {
    const motionScore = Math.max(
      0,
      Math.min(1.0, 1.0 - accelMagnitudeStd / config.motionStdThreshold)
    );
    score += config.motionArtifactWeight * motionScore;
    totalWeight += config.motionArtifactWeight;
  }

  // Normalize score by total weight used (handles missing components)
  if (totalWeight > 0) {
    return Math.min(1.0, Math.max(0.0, score / totalWeight));
  } else {
    // No data available at all
    return 0.0;
  }
}

/**
 * Interpret quality score as a category.
 *
 * @param score Quality score (0-1)
 * @returns Quality category
 */
export function getQualityCategory(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= 0.8) return 'excellent';
  if (score >= 0.6) return 'good';
  if (score >= 0.4) return 'fair';
  return 'poor';
}

/**
 * Check if quality score is acceptable for feature extraction.
 *
 * @param score Quality score
 * @param minAcceptable Minimum acceptable score (default: 0.3)
 * @returns True if quality is acceptable
 */
export function isQualityAcceptable(score: number, minAcceptable: number = 0.3): boolean {
  return score >= minAcceptable;
}
