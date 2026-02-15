import { describe, it, expect } from "vitest";
import {
  computeNonLinearFeatures,
  computePoincareFeaturesFromRR,
  computePoincarePlotData,
} from "../poincare-features";

describe("computeNonLinearFeatures", () => {
  it("computes SD1, SD2, ratio, and area from SDNN and SDSD", () => {
    const sdnn = 50;
    const sdsd = 30;
    const { sd1, sd2, sd1sd2, area } = computeNonLinearFeatures(sdnn, sdsd);

    // SD1 = SDSD / sqrt(2)
    expect(sd1).toBeCloseTo(30 / Math.sqrt(2), 5);
    expect(sd2).toBeGreaterThan(0);
    expect(sd1sd2).toBeGreaterThan(0);
    expect(area).toBeCloseTo(Math.PI * sd1 * sd2, 5);
  });
  it("handles zero SDSD", () => {
    const { sd1, sd2, area } = computeNonLinearFeatures(50, 0);
    expect(sd1).toBe(0);
    expect(sd2).toBeGreaterThan(0);
    expect(area).toBe(0);
  });
  it("handles case where sd2Term would be negative", () => {
    // When sdsd is very large relative to sdnn
    const { sd2 } = computeNonLinearFeatures(10, 100);
    expect(sd2).toBe(0);
  });
});

describe("computePoincareFeaturesFromRR", () => {
  it("returns zeros for insufficient data", () => {
    const result = computePoincareFeaturesFromRR([]);
    expect(result.sd1).toBe(0);
    expect(result.sd2).toBe(0);

    const result2 = computePoincareFeaturesFromRR([800]);
    expect(result2.sd1).toBe(0);
  });
  it("computes features from RR intervals", () => {
    // Gradual drift ensures SDNN > SDSD so sd2Term stays positive
    const rr = [750, 770, 790, 810, 830, 850, 830, 810, 790, 770];
    const { sd1, sd2, sd1sd2, area } = computePoincareFeaturesFromRR(rr);
    expect(sd1).toBeGreaterThan(0);
    expect(sd2).toBeGreaterThan(0);
    expect(sd1sd2).toBeGreaterThan(0);
    expect(area).toBeGreaterThan(0);
  });
});

describe("computePoincarePlotData", () => {
  it("returns pairs of consecutive RR intervals", () => {
    const rr = [800, 850, 780, 900];
    const points = computePoincarePlotData(rr);
    expect(points).toEqual([
      [800, 850],
      [850, 780],
      [780, 900],
    ]);
  });
  it("returns empty for single element", () => {
    expect(computePoincarePlotData([800])).toEqual([]);
  });
});
