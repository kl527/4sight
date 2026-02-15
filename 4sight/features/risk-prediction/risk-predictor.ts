/**
 * On-device risk predictor.
 *
 * Runs the trained XGBoost ensemble locally using pure TypeScript.
 * Produces a prediction for every window, and maintains a rolling
 * average over the last ROLLING_WINDOW predictions for responsiveness.
 *
 * Usage:
 *   const predictor = new RiskPredictor();
 *   const result = predictor.pushAndPredict(biosignalFeatures);
 *   // result.prediction  — this window's raw prediction
 *   // result.cumulative   — rolling average over recent windows
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
  /** Rolling average over recent windows */
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
  static readonly ROLLING_WINDOW = 10;

  private model: ModelConfig;
  private windowCount = 0;
  private predictionBuffer: RiskPrediction[] = [];

  constructor() {
    this.model = modelJSON as unknown as ModelConfig;
  }

  /**
   * Feed a new BiosignalFeatures window. Always returns a prediction.
   *
   * Every call produces:
   * - prediction: the raw result from this single window
   * - cumulative: rolling average over the last ROLLING_WINDOW predictions
   * - windowCount: total windows processed
   */
  pushAndPredict(features: BiosignalFeatures): PredictionResult {
    const prediction = this.predict(features, features.timestamp);
    this.windowCount++;

    // Push into rolling buffer, trim to window size
    this.predictionBuffer.push(prediction);
    if (this.predictionBuffer.length > RiskPredictor.ROLLING_WINDOW) {
      this.predictionBuffer.shift();
    }

    const cumulative = this.buildCumulative(prediction.timestamp);

    return { prediction, cumulative, windowCount: this.windowCount };
  }

  /** Reset all accumulated state (e.g. new session). */
  reset(): void {
    this.windowCount = 0;
    this.predictionBuffer = [];
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
    const buf = this.predictionBuffer;
    const n = buf.length;
    const riskLabels = this.model.config.riskLabels;
    const nClasses = this.model.config.nClasses;

    const buildDimRisk = (dim: typeof RISK_DIMENSIONS[number]): DimensionRisk => {
      const avgProbs = new Array(nClasses).fill(0);
      for (const p of buf) {
        const probs = p.riskAssessment[dim].probabilities;
        for (let c = 0; c < nClasses; c++) avgProbs[c] += probs[c];
      }
      for (let c = 0; c < nClasses; c++) avgProbs[c] /= n;
      const level = argmax(avgProbs);
      return {
        level,
        label: riskLabels[level],
        confidence: avgProbs[level],
        probabilities: avgProbs,
      };
    };

    let sumSusc = 0, sumTime = 0, sumLower = 0, sumUpper = 0, sumConf = 0;
    let minConf = Infinity;
    for (const p of buf) {
      sumSusc += p.overallSusceptibility;
      sumTime += p.timeToRiskMinutes;
      sumLower += p.timeToRiskRange.lower;
      sumUpper += p.timeToRiskRange.upper;
      sumConf += p.modelConfidence.average;
      if (p.modelConfidence.average < minConf) minConf = p.modelConfidence.average;
    }

    const susceptibility = clamp(sumSusc / n, 0, 1);
    const timeToRisk = clamp(sumTime / n, 3, 30);
    const timeLower = clamp(sumLower / n, 3, timeToRisk);
    const timeUpper = clamp(sumUpper / n, timeToRisk, 30);

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
      modelConfidence: { average: sumConf / n, min: minConf },
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
