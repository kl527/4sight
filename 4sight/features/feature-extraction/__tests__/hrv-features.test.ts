import { describe, it, expect } from "vitest";
import {
  computeTimeDomainFeatures,
  computeBasicHRV,
  computeRMSSD,
  computeSDNN,
} from "../hrv-features";

// Typical resting RR intervals (~800ms = 75 BPM, with some variability)
const RR_INTERVALS = [800, 810, 790, 820, 780, 830, 770, 815, 795, 805];

describe("computeTimeDomainFeatures", () => {
  it("computes all 15 time-domain features", () => {
    const features = computeTimeDomainFeatures(RR_INTERVALS);
    expect(features.hrMean).toBeGreaterThan(60);
    expect(features.hrMean).toBeLessThan(100);
    expect(features.hrStd).toBeGreaterThan(0);
    expect(features.sdnn).toBeGreaterThan(0);
    expect(features.rmssd).toBeGreaterThan(0);
    expect(features.pnn50).toBeGreaterThanOrEqual(0);
    expect(features.pnn50).toBeLessThanOrEqual(100);
    expect(features.pnn20).toBeGreaterThanOrEqual(0);
    expect(features.cvnn).toBeGreaterThan(0);
    expect(features.cvsd).toBeGreaterThan(0);
    expect(features.medianRR).toBeGreaterThan(0);
    expect(features.rangeRR).toBeGreaterThan(0);
    expect(features.iqrRR).toBeGreaterThanOrEqual(0);
    expect(features.hrMin).toBeLessThanOrEqual(features.hrMax);
  });
  it("SDNN matches population std of RR intervals", () => {
    const features = computeTimeDomainFeatures(RR_INTERVALS);
    // SDNN = population std of RR intervals
    const meanRR =
      RR_INTERVALS.reduce((a, b) => a + b, 0) / RR_INTERVALS.length;
    const expectedStd = Math.sqrt(
      RR_INTERVALS.reduce((s, v) => s + (v - meanRR) ** 2, 0) /
        RR_INTERVALS.length
    );
    expect(features.sdnn).toBeCloseTo(expectedStd, 5);
  });
});

describe("computeBasicHRV", () => {
  it("returns hrMean, sdnn, rmssd", () => {
    const { hrMean, sdnn, rmssd } = computeBasicHRV(RR_INTERVALS);
    expect(hrMean).toBeGreaterThan(0);
    expect(sdnn).toBeGreaterThan(0);
    expect(rmssd).toBeGreaterThan(0);
  });
});

describe("computeRMSSD", () => {
  it("returns 0 for single element", () => {
    expect(computeRMSSD([800])).toBe(0);
  });
  it("computes RMSSD correctly for known data", () => {
    // RR: [800, 850], diffs: [50], RMSSD = sqrt(mean([2500])) = 50
    expect(computeRMSSD([800, 850])).toBeCloseTo(50);
  });
  it("computes RMSSD for typical data", () => {
    const rmssd = computeRMSSD(RR_INTERVALS);
    expect(rmssd).toBeGreaterThan(0);
  });
});

describe("computeSDNN", () => {
  it("returns population std of RR intervals", () => {
    const sdnn = computeSDNN(RR_INTERVALS);
    expect(sdnn).toBeGreaterThan(0);
  });
});
