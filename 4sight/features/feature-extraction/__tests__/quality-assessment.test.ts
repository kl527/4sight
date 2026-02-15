import { describe, it, expect } from "vitest";
import {
  computeQualityScore,
  getQualityCategory,
  isQualityAcceptable,
} from "../quality-assessment";
import type { RRResult } from "../types";

describe("computeQualityScore", () => {
  it("returns 0 when no data at all", () => {
    const score = computeQualityScore(null, null, null, null);
    expect(score).toBe(0);
  });
  it("returns score based on PPG alone", () => {
    // Generate a PPG with decent variability
    const ppg = Array.from({ length: 100 }, (_, i) => Math.sin(i * 0.2) * 100);
    const score = computeQualityScore(ppg, ppg, null, null);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
  it("returns high score for ideal data", () => {
    const ppg = Array.from({ length: 100 }, (_, i) => Math.sin(i * 0.2) * 100);
    const rrResult: RRResult = {
      validRR: Array.from({ length: 35 }, () => 800),
      peakCount: 36,
      outlierCount: 0,
    };
    const score = computeQualityScore(ppg, ppg, rrResult, 0.01);
    expect(score).toBeGreaterThan(0.5);
  });
  it("penalizes high motion", () => {
    const ppg = Array.from({ length: 100 }, (_, i) => Math.sin(i * 0.2) * 100);
    const lowMotion = computeQualityScore(ppg, ppg, null, 0.01);
    const highMotion = computeQualityScore(ppg, ppg, null, 0.5);
    expect(lowMotion).toBeGreaterThan(highMotion);
  });
});

describe("getQualityCategory", () => {
  it("returns 'excellent' for >= 0.8", () => {
    expect(getQualityCategory(0.9)).toBe("excellent");
    expect(getQualityCategory(0.8)).toBe("excellent");
  });
  it("returns 'good' for >= 0.6", () => {
    expect(getQualityCategory(0.7)).toBe("good");
  });
  it("returns 'fair' for >= 0.4", () => {
    expect(getQualityCategory(0.5)).toBe("fair");
  });
  it("returns 'poor' for < 0.4", () => {
    expect(getQualityCategory(0.2)).toBe("poor");
  });
});

describe("isQualityAcceptable", () => {
  it("returns true when above threshold", () => {
    expect(isQualityAcceptable(0.5)).toBe(true);
  });
  it("returns false when below threshold", () => {
    expect(isQualityAcceptable(0.1)).toBe(false);
  });
  it("accepts custom threshold", () => {
    expect(isQualityAcceptable(0.5, 0.6)).toBe(false);
    expect(isQualityAcceptable(0.5, 0.4)).toBe(true);
  });
});
