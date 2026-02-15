import { describe, it, expect } from "vitest";
import { computeDerivedFeatures } from "../derived-features";
import type { BiosignalFeatures } from "@/features/feature-extraction/types";

function makeFeatures(
  overrides: Partial<BiosignalFeatures> = {}
): BiosignalFeatures {
  return {
    hrMean: 75,
    hrStd: 5,
    hrMin: 65,
    hrMax: 85,
    meanRR: 800,
    sdnn: 50,
    rmssd: 30,
    sdsd: 25,
    pnn50: 20,
    pnn20: 60,
    cvnn: 0.0625,
    cvsd: 0.0375,
    medianRR: 800,
    rangeRR: 100,
    iqrRR: 40,
    sd1: 17.7,
    sd2: 67.8,
    sd1sd2: 0.26,
    poincareArea: 3768,
    accelMeanX: 0,
    accelMeanY: 0,
    accelMeanZ: 1.0,
    accelStdX: 0.05,
    accelStdY: 0.05,
    accelStdZ: 0.05,
    accelMagnitudeMean: 1.0,
    accelMagnitudeStd: 0.02,
    accelMagnitudeMax: 1.1,
    movementIntensity: 0.01,
    accelEnergy: 50,
    ppgSampleCount: 750,
    accelSampleCount: 360,
    peakCount: 38,
    validRRCount: 37,
    qualityScore: 0.85,
    windowId: "test-window",
    timestamp: Date.now(),
    durationMs: 30000,
    ...overrides,
  };
}

describe("computeDerivedFeatures", () => {
  it("returns 9 derived features", () => {
    const result = computeDerivedFeatures(makeFeatures());
    expect(result.length).toBe(9);
  });
  it("computes hr_var_ratio correctly", () => {
    const f = makeFeatures({ hrMean: 75, hrStd: 5 });
    const result = computeDerivedFeatures(f);
    expect(result[0]).toBeCloseTo(5 / (75 + 1e-6), 5);
  });
  it("computes hr_cv as 0 when hrMean is 0", () => {
    const f = makeFeatures({ hrMean: 0, hrStd: 5 });
    const result = computeDerivedFeatures(f);
    expect(result[1]).toBe(0);
  });
  it("computes hrv_power as sqrt(sdnn^2 + rmssd^2)", () => {
    const f = makeFeatures({ sdnn: 30, rmssd: 40 });
    const result = computeDerivedFeatures(f);
    expect(result[3]).toBeCloseTo(50, 5); // 3-4-5 triangle
  });
  it("computes weighted_sdnn as sdnn * qualityScore", () => {
    const f = makeFeatures({ sdnn: 50, qualityScore: 0.8 });
    const result = computeDerivedFeatures(f);
    expect(result[8]).toBeCloseTo(40, 5);
  });
  it("handles null/undefined fields gracefully", () => {
    const f = makeFeatures({
      hrMean: null,
      hrStd: null,
      sdnn: null,
      rmssd: null,
    });
    const result = computeDerivedFeatures(f);
    expect(result.every((v) => isFinite(v))).toBe(true);
  });
});
