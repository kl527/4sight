import { describe, it, expect } from "vitest";
import { predictRegressor, predictClassifier } from "../xgboost-engine";
import type { XGBoostModelJSON, XGBoostTree } from "../types";

/**
 * Build a minimal single-split tree:
 *
 *       [0] feature[0] < threshold?
 *      /                          \
 *   [1] leaf=leftVal         [2] leaf=rightVal
 */
function makeSimpleTree(
  threshold: number,
  leftVal: number,
  rightVal: number,
  featureIdx: number = 0
): XGBoostTree {
  return {
    left_children: [1, -1, -1],
    right_children: [2, -1, -1],
    split_conditions: [threshold, leftVal, rightVal],
    split_indices: [featureIdx, 0, 0],
    base_weights: [0, leftVal, rightVal],
    default_left: [1, 0, 0],
  };
}

function makeRegressorModel(
  trees: XGBoostTree[],
  baseScore: string = "0"
): XGBoostModelJSON {
  return {
    learner: {
      gradient_booster: {
        model: {
          trees,
          tree_info: trees.map(() => 0),
        },
      },
      learner_model_param: {
        base_score: baseScore,
      },
    },
  };
}

describe("predictRegressor", () => {
  it("returns base_score when no trees", () => {
    const model = makeRegressorModel([], "5.0");
    expect(predictRegressor(model, [1, 2, 3])).toBeCloseTo(5.0);
  });
  it("traverses single tree correctly (left branch)", () => {
    const tree = makeSimpleTree(10, 3.0, 7.0);
    const model = makeRegressorModel([tree], "0");
    // feature[0] = 5 < 10 → left → leaf value 3.0
    expect(predictRegressor(model, [5])).toBeCloseTo(3.0);
  });
  it("traverses single tree correctly (right branch)", () => {
    const tree = makeSimpleTree(10, 3.0, 7.0);
    const model = makeRegressorModel([tree], "0");
    // feature[0] = 15 >= 10 → right → leaf value 7.0
    expect(predictRegressor(model, [15])).toBeCloseTo(7.0);
  });
  it("sums multiple trees + base_score", () => {
    const tree1 = makeSimpleTree(10, 1.0, 2.0);
    const tree2 = makeSimpleTree(10, 0.5, 1.5);
    const model = makeRegressorModel([tree1, tree2], "0.5");
    // feature[0] = 5 < 10 → both go left: 0.5 + 1.0 + 0.5 = 2.0
    expect(predictRegressor(model, [5])).toBeCloseTo(2.0);
  });
  it("handles NaN by following default_left", () => {
    const tree = makeSimpleTree(10, 3.0, 7.0);
    tree.default_left = [1, 0, 0]; // default goes left
    const model = makeRegressorModel([tree], "0");
    expect(predictRegressor(model, [NaN])).toBeCloseTo(3.0);
  });
  it("parses string-encoded base_score with brackets", () => {
    const model = makeRegressorModel([], "[5E-1]");
    expect(predictRegressor(model, [])).toBeCloseTo(0.5);
  });
  it("parses array base_score", () => {
    const model: XGBoostModelJSON = {
      learner: {
        gradient_booster: { model: { trees: [], tree_info: [] } },
        learner_model_param: { base_score: ["2.5"] },
      },
    };
    expect(predictRegressor(model, [])).toBeCloseTo(2.5);
  });
});

describe("predictClassifier", () => {
  it("predicts class from interleaved trees", () => {
    // 2 classes, 2 trees each (4 total: t0→c0, t1→c1, t2→c0, t3→c1)
    const tree_c0_1 = makeSimpleTree(10, 2.0, -1.0); // feature[0]<10 → +2
    const tree_c1_1 = makeSimpleTree(10, -1.0, 2.0); // feature[0]<10 → -1
    const tree_c0_2 = makeSimpleTree(10, 1.0, -0.5);
    const tree_c1_2 = makeSimpleTree(10, -0.5, 1.0);

    const model: XGBoostModelJSON = {
      learner: {
        gradient_booster: {
          model: {
            trees: [tree_c0_1, tree_c1_1, tree_c0_2, tree_c1_2],
            tree_info: [0, 0, 0, 0],
          },
        },
        learner_model_param: {
          base_score: "[0,0]",
        },
      },
    };

    // feature[0] = 5 < 10 → all go left
    // c0: 0 + 2.0 + 1.0 = 3.0
    // c1: 0 + (-1.0) + (-0.5) = -1.5
    const result = predictClassifier(model, [5], 2);
    expect(result.predictedClass).toBe(0);
    expect(result.probabilities.length).toBe(2);
    expect(result.probabilities[0]).toBeGreaterThan(result.probabilities[1]);
    // Probabilities should sum to 1 (softmax)
    const probSum = result.probabilities.reduce((a, b) => a + b, 0);
    expect(probSum).toBeCloseTo(1.0, 5);
  });
  it("handles array base_score", () => {
    const model: XGBoostModelJSON = {
      learner: {
        gradient_booster: { model: { trees: [], tree_info: [] } },
        learner_model_param: { base_score: ["0.5", "0.5"] },
      },
    };
    const result = predictClassifier(model, [], 2);
    // Equal base scores → equal probabilities
    expect(result.probabilities[0]).toBeCloseTo(0.5);
    expect(result.probabilities[1]).toBeCloseTo(0.5);
  });
});
