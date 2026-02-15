/**
 * On-device risk predictor.
 *
 * Runs the trained XGBoost ensemble locally using pure TypeScript.
 * Produces a prediction for every window, and maintains a running
 * average that gets progressively more robust with more data.
 *
 * Usage:
 *   const predictor = new RiskPredictor();
 *   const result = predictor.pushAndPredict(biosignalFeatures);
 *   // result.prediction  — this window's raw prediction
 *   // result.cumulative   — running average across all windows seen
 *   // result.windowCount  — how many windows have been processed
 */

import type { BiosignalFeatures } from '@/features/feature-extraction/types';
import type { ModelConfig, RiskPrediction, DimensionRisk } from './types';
import { predictClassifier, predictRegressor } from './xgboost-engine';
import { computeDerivedFeatures } from './derived-features';
import { robustScale } from './scaler';

// Loaded at bundle time by Metro
import modelJSON from '@/assets/models/risk_model.json';

// ============================================================================
// TYPES
// ============================================================================

export interface PredictionResult {
  /** Raw prediction from this single window */
  prediction: RiskPrediction;
  /** Running average across all windows — gets more robust over time */
  cumulative: RiskPrediction;
  /** Number of windows processed so far */
  windowCount: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * The 27 base features the model expects, in order.
 * These are pulled from BiosignalFeatures (which has more fields than we need).
 */
const BASE_FEATURE_KEYS: (keyof BiosignalFeatures)[] = [
  // HRV (19)
  'hrMean', 'hrStd', 'hrMin', 'hrMax',
  'meanRR', 'sdnn', 'rmssd', 'sdsd',
  'pnn50', 'pnn20', 'cvnn', 'cvsd',
  'medianRR', 'rangeRR', 'iqrRR',
  'sd1', 'sd2', 'sd1sd2', 'poincareArea',
  // Accelerometer (5 aggregate — NOT per-axis)
  'accelEnergy', 'accelMagnitudeMax', 'accelMagnitudeMean',
  'accelMagnitudeStd', 'movementIntensity',
  // Quality (3)
  'peakCount', 'validRRCount', 'qualityScore',
];

const RISK_DIMENSIONS = ['stress', 'health', 'sleepFatigue', 'cognitiveFatigue', 'physicalExertion'] as const;

// ============================================================================
// RISK PREDICTOR
// ============================================================================

export class RiskPredictor {
  private model: ModelConfig;
  private windowCount = 0;

  // Running sums for cumulative averaging
  private sumLevels = { stress: 0, health: 0, sleepFatigue: 0, cognitiveFatigue: 0, physicalExertion: 0 };
  private sumProbs = { stress: [0, 0, 0, 0], health: [0, 0, 0, 0], sleepFatigue: [0, 0, 0, 0], cognitiveFatigue: [0, 0, 0, 0], physicalExertion: [0, 0, 0, 0] };
  private sumSusceptibility = 0;
  private sumTimeToRisk = 0;
  private sumTimeLower = 0;
  private sumTimeUpper = 0;
  private sumConfidences: number[] = [];

  constructor() {
    this.model = modelJSON as unknown as ModelConfig;
  }

  /**
   * Feed a new BiosignalFeatures window. Always returns a prediction.
   *
   * Every call produces:
   * - prediction: the raw result from this single window
   * - cumulative: running average across ALL windows seen so far
   * - windowCount: total windows processed
   *
   * The cumulative prediction gets progressively more robust with each window.
   * Works correctly for both real-time (1 window at a time) and batch catchup
   * (10 windows downloaded at once on login).
   */
  pushAndPredict(features: BiosignalFeatures): PredictionResult {
    const prediction = this.predict(features, features.timestamp);
    this.windowCount++;

    // Accumulate into running sums
    for (const dim of RISK_DIMENSIONS) {
      const risk = prediction.riskAssessment[dim];
      this.sumLevels[dim] += risk.level;
      for (let c = 0; c < risk.probabilities.length; c++) {
        this.sumProbs[dim][c] += risk.probabilities[c];
      }
    }
    this.sumSusceptibility += prediction.overallSusceptibility;
    this.sumTimeToRisk += prediction.timeToRiskMinutes;
    this.sumTimeLower += prediction.timeToRiskRange.lower;
    this.sumTimeUpper += prediction.timeToRiskRange.upper;
    this.sumConfidences.push(prediction.modelConfidence.average);

    // Build cumulative average
    const cumulative = this.buildCumulative(prediction.timestamp);

    return { prediction, cumulative, windowCount: this.windowCount };
  }

  /** Reset all accumulated state (e.g. new session). */
  reset(): void {
    this.windowCount = 0;
    for (const dim of RISK_DIMENSIONS) {
      this.sumLevels[dim] = 0;
      this.sumProbs[dim] = [0, 0, 0, 0];
    }
    this.sumSusceptibility = 0;
    this.sumTimeToRisk = 0;
    this.sumTimeLower = 0;
    this.sumTimeUpper = 0;
    this.sumConfidences = [];
  }

  /**
   * Run a single prediction on a BiosignalFeatures object.
   */
  predict(features: BiosignalFeatures, timestamp?: number): RiskPrediction {
    const { model } = this;
    const nClasses = model.config.nClasses;

    // 1. Extract 27 base features in model's expected order
    const baseValues = BASE_FEATURE_KEYS.map((key) => {
      const val = features[key];
      return typeof val === 'number' && !isNaN(val) ? val : 0;
    });

    // 2. Compute 9 derived features
    const derived = computeDerivedFeatures(features);

    // 3. Concatenate → 36 features (indexed by position, matching split_indices)
    const allFeatures = [...baseValues, ...derived];

    // 4. Scale
    const scaled = robustScale(allFeatures, model.scaler.center, model.scaler.scale);

    // 5. Run classifiers
    const stress = this.classifyDimension(model.classifiers.stress, scaled, nClasses);
    const health = this.classifyDimension(model.classifiers.health, scaled, nClasses);
    const sleepFatigue = this.classifyDimension(model.classifiers.sleep_fatigue, scaled, nClasses);
    const cognitiveFatigue = this.classifyDimension(model.classifiers.cognitive_fatigue, scaled, nClasses);
    const physicalExertion = this.classifyDimension(model.classifiers.physical_exertion, scaled, nClasses);

    // 6. Run regressors
    let susceptibility = predictRegressor(model.regressors.susceptibility, scaled);
    susceptibility = clamp(susceptibility, 0, 1);

    let timeToRisk = predictRegressor(model.regressors.time_to_risk, scaled);
    let timeLower = predictRegressor(model.regressors.time_lower_bound, scaled);
    let timeUpper = predictRegressor(model.regressors.time_upper_bound, scaled);

    timeToRisk = clamp(timeToRisk, 3, 30);
    timeLower = clamp(timeLower, 3, timeToRisk);
    timeUpper = clamp(timeUpper, timeToRisk, 30);

    // 7. Alert level
    const alertLevel = this.getAlertLevel(susceptibility);

    // 8. Confidence
    const confidences = [
      stress.confidence, health.confidence, sleepFatigue.confidence,
      cognitiveFatigue.confidence, physicalExertion.confidence,
    ];
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const minConfidence = Math.min(...confidences);

    return {
      timestamp: timestamp ?? Date.now(),
      riskAssessment: { stress, health, sleepFatigue, cognitiveFatigue, physicalExertion },
      overallSusceptibility: susceptibility,
      timeToRiskMinutes: timeToRisk,
      timeToRiskRange: { lower: timeLower, upper: timeUpper, confidenceInterval: '80%' },
      alertLevel,
      modelConfidence: { average: avgConfidence, min: minConfidence },
    };
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  private buildCumulative(timestamp: number): RiskPrediction {
    const n = this.windowCount;
    const riskLabels = this.model.config.riskLabels;

    const buildDimRisk = (dim: typeof RISK_DIMENSIONS[number]): DimensionRisk => {
      const avgProbs = this.sumProbs[dim].map((s) => s / n);
      const level = argmax(avgProbs);
      return {
        level,
        label: riskLabels[level],
        confidence: avgProbs[level],
        probabilities: avgProbs,
      };
    };

    const susceptibility = clamp(this.sumSusceptibility / n, 0, 1);
    const timeToRisk = clamp(this.sumTimeToRisk / n, 3, 30);
    const timeLower = clamp(this.sumTimeLower / n, 3, timeToRisk);
    const timeUpper = clamp(this.sumTimeUpper / n, timeToRisk, 30);

    const avgConfidence = this.sumConfidences.reduce((a, b) => a + b, 0) / n;
    const minConfidence = Math.min(...this.sumConfidences);

    return {
      timestamp,
      riskAssessment: {
        stress: buildDimRisk('stress'),
        health: buildDimRisk('health'),
        sleepFatigue: buildDimRisk('sleepFatigue'),
        cognitiveFatigue: buildDimRisk('cognitiveFatigue'),
        physicalExertion: buildDimRisk('physicalExertion'),
      },
      overallSusceptibility: susceptibility,
      timeToRiskMinutes: timeToRisk,
      timeToRiskRange: { lower: timeLower, upper: timeUpper, confidenceInterval: '80%' },
      alertLevel: this.getAlertLevel(susceptibility),
      modelConfidence: { average: avgConfidence, min: minConfidence },
    };
  }

  private classifyDimension(
    modelJson: ModelConfig['classifiers'][string],
    scaled: number[],
    nClasses: number,
  ): DimensionRisk {
    const { predictedClass, probabilities } = predictClassifier(modelJson, scaled, nClasses);
    return {
      level: predictedClass,
      label: this.model.config.riskLabels[predictedClass],
      confidence: probabilities[predictedClass],
      probabilities,
    };
  }

  private getAlertLevel(susceptibility: number): string {
    const t = this.model.config.alertThresholds;
    if (susceptibility >= t.critical) return 'CRITICAL ALERT';
    if (susceptibility >= t.high) return 'HIGH ALERT';
    if (susceptibility >= t.moderate) return 'MODERATE ALERT';
    if (susceptibility >= t.low) return 'LOW ALERT';
    return 'NO ALERT';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function argmax(arr: number[]): number {
  let best = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[best]) best = i;
  }
  return best;
}
