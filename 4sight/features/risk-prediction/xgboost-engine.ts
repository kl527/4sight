/**
 * Pure TypeScript XGBoost inference engine.
 *
 * Walks exported XGBoost decision trees (flat array format) to produce
 * predictions identical to the Python model — no native dependencies needed.
 */

import type { XGBoostTree, XGBoostModelJSON } from './types';

// ============================================================================
// TREE TRAVERSAL (flat array format)
// ============================================================================

/**
 * Walk a single decision tree to its leaf value.
 *
 * In the flat format, each node is an index into parallel arrays:
 * - left_children[i] / right_children[i]: child node IDs (-1 = leaf)
 * - split_indices[i]: which feature to split on
 * - split_conditions[i]: threshold value
 * - base_weights[i]: leaf value (when node is a leaf)
 * - default_left[i]: 1 if missing values go left, 0 for right
 */
function traverseTree(tree: XGBoostTree, features: number[]): number {
  let nodeId = 0; // Start at root

  while (true) {
    // Leaf node check: left_children == -1 means leaf
    if (tree.left_children[nodeId] === -1) {
      return tree.base_weights[nodeId];
    }

    const featureIdx = tree.split_indices[nodeId];
    const threshold = tree.split_conditions[nodeId];
    const value = features[featureIdx];

    // Handle missing / NaN
    if (value === null || value === undefined || isNaN(value)) {
      nodeId = tree.default_left[nodeId] === 1
        ? tree.left_children[nodeId]
        : tree.right_children[nodeId];
      continue;
    }

    // Standard split: < threshold goes left, >= goes right
    if (value < threshold) {
      nodeId = tree.left_children[nodeId];
    } else {
      nodeId = tree.right_children[nodeId];
    }
  }
}

// ============================================================================
// REGRESSION PREDICTION
// ============================================================================

function parseBaseScore(raw: string | string[]): number {
  if (Array.isArray(raw)) {
    return parseFloat(raw[0]);
  }
  // Handle string-encoded arrays like '[5E-1]' or '[2.06E-1]'
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    return parseFloat(trimmed.slice(1).replace(']', ''));
  }
  return parseFloat(raw);
}

/**
 * Predict a single continuous value (sum of leaf values + base_score).
 */
export function predictRegressor(model: XGBoostModelJSON, features: number[]): number {
  const trees = model.learner.gradient_booster.model.trees;
  const baseScore = parseBaseScore(model.learner.learner_model_param.base_score);

  let sum = baseScore;
  for (let i = 0; i < trees.length; i++) {
    sum += traverseTree(trees[i], features);
  }
  return sum;
}

// ============================================================================
// MULTI-CLASS CLASSIFICATION
// ============================================================================

function softmax(values: number[]): number[] {
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * Predict class probabilities for a multi-class XGBoost classifier.
 *
 * Trees are interleaved by class: tree 0 → class 0, tree 1 → class 1, etc.
 * base_score is per-class: e.g. [0.5, 0.5, 0.5, 0.5] for 4 classes.
 */
export function predictClassifier(
  model: XGBoostModelJSON,
  features: number[],
  nClasses: number,
): { predictedClass: number; probabilities: number[] } {
  const trees = model.learner.gradient_booster.model.trees;
  const rawBaseScore = model.learner.learner_model_param.base_score;

  // Parse per-class base scores
  let baseScores: number[];
  if (Array.isArray(rawBaseScore)) {
    baseScores = rawBaseScore.map((s) => parseFloat(s));
  } else {
    // Handle string-encoded JSON array: '[5E-1,5E-1,5E-1,5E-1]'
    const trimmed = rawBaseScore.trim();
    if (trimmed.startsWith('[')) {
      baseScores = trimmed.slice(1, -1).split(',').map((s) => parseFloat(s.trim()));
    } else {
      baseScores = new Array(nClasses).fill(parseFloat(rawBaseScore));
    }
  }

  const rawScores = [...baseScores];

  for (let i = 0; i < trees.length; i++) {
    const classIdx = i % nClasses;
    rawScores[classIdx] += traverseTree(trees[i], features);
  }

  const probabilities = softmax(rawScores);
  let predictedClass = 0;
  let maxProb = probabilities[0];
  for (let i = 1; i < nClasses; i++) {
    if (probabilities[i] > maxProb) {
      maxProb = probabilities[i];
      predictedClass = i;
    }
  }

  return { predictedClass, probabilities };
}
