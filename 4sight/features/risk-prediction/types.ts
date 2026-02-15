/**
 * Types for on-device XGBoost risk prediction.
 */

// ============================================================================
// XGBOOST MODEL STRUCTURE (flat array format from XGBoost v2+ JSON export)
// ============================================================================

/** A single decision tree in flat array format. */
export interface XGBoostTree {
  /** Left child node IDs (-1 = leaf) */
  left_children: number[];
  /** Right child node IDs (-1 = leaf) */
  right_children: number[];
  /** Split thresholds (for internal nodes) or leaf values */
  split_conditions: number[];
  /** Feature index to split on (for internal nodes) */
  split_indices: number[];
  /** Node weights/values (leaf values for leaf nodes) */
  base_weights: number[];
  /** Whether default (missing) goes left (1) or right (0) */
  default_left: number[];
}

export interface XGBoostModelJSON {
  learner: {
    gradient_booster: {
      model: {
        trees: XGBoostTree[];
        tree_info: number[];
      };
    };
    learner_model_param: {
      base_score: string | string[];
      num_class?: string;
    };
  };
}

// ============================================================================
// EXPORTED MODEL CONFIG
// ============================================================================

export interface ModelConfig {
  version: string;
  featureOrder: string[];
  scaler: {
    center: number[];
    scale: number[];
  };
  classifiers: Record<string, XGBoostModelJSON>;
  regressors: Record<string, XGBoostModelJSON>;
  config: {
    nClasses: number;
    riskWeights: Record<string, number>;
    riskLabels: string[];
    alertThresholds: {
      critical: number;
      high: number;
      moderate: number;
      low: number;
    };
  };
}

// ============================================================================
// PREDICTION OUTPUT
// ============================================================================

export interface DimensionRisk {
  level: number;
  label: string;
  confidence: number;
  probabilities: number[];
}

export interface RiskPrediction {
  timestamp: number;
  riskAssessment: {
    stress: DimensionRisk;
    health: DimensionRisk;
    sleepFatigue: DimensionRisk;
    cognitiveFatigue: DimensionRisk;
    physicalExertion: DimensionRisk;
  };
  overallSusceptibility: number;
  timeToRiskMinutes: number;
  timeToRiskRange: {
    lower: number;
    upper: number;
    confidenceInterval: string;
  };
  alertLevel: string;
  modelConfidence: {
    average: number;
    min: number;
  };
}
