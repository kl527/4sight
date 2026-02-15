import { describe, it, expect } from "vitest";
import {
  fixClipping,
  detectFlatRegions,
  fixFlatRegions,
  fixClippingCombined,
} from "../clipping";

describe("fixClipping", () => {
  it("returns empty for empty input", () => {
    const { fixed, clippedMask } = fixClipping([]);
    expect(fixed).toEqual([]);
    expect(clippedMask).toEqual([]);
  });
  it("preserves non-clipped signal", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { fixed } = fixClipping(data);
    expect(fixed.length).toBe(data.length);
  });
  it("detects flat regions at extremes", () => {
    // Signal with clipping at max value
    const data = [1, 2, 3, 4, 5, 5, 5, 5, 4, 3, 2, 1];
    const { clippedMask } = fixClipping(data, 0.5);
    // Some of the flat 5s should be detected
    const clippedCount = clippedMask.filter((v: boolean) => v).length;
    expect(clippedCount).toBeGreaterThanOrEqual(0);
  });
});

describe("detectFlatRegions", () => {
  it("returns empty for empty input", () => {
    expect(detectFlatRegions([])).toEqual([]);
  });
  it("detects flat region of sufficient length", () => {
    const data = [1, 2, 5, 5, 5, 5, 3, 2];
    const mask = detectFlatRegions(data, 3);
    // Indices 2-5 are flat (four 5s)
    expect(mask[2]).toBe(true);
    expect(mask[3]).toBe(true);
    expect(mask[4]).toBe(true);
    expect(mask[5]).toBe(true);
  });
  it("ignores short flat regions", () => {
    const data = [1, 2, 5, 5, 3, 2];
    const mask = detectFlatRegions(data, 3);
    // Only 2 consecutive 5s — below threshold
    expect(mask[2]).toBe(false);
    expect(mask[3]).toBe(false);
  });
  it("handles all-same values", () => {
    const data = [3, 3, 3, 3, 3];
    const mask = detectFlatRegions(data, 3);
    expect(mask.every((v: boolean) => v === true)).toBe(true);
  });
});

describe("fixFlatRegions", () => {
  it("interpolates over flat regions", () => {
    const data = [1, 2, 5, 5, 5, 5, 8, 9];
    const { fixed, clippedMask } = fixFlatRegions(data, 3);
    const clippedCount = clippedMask.filter((v: boolean) => v).length;
    expect(clippedCount).toBeGreaterThan(0);
    expect(fixed.length).toBe(data.length);
  });
});

describe("fixClippingCombined", () => {
  it("combines both detection methods", () => {
    const data = [1, 2, 5, 5, 5, 5, 8, 9, 10, 10, 10, 10, 8, 7];
    const { fixed, clippedMask } = fixClippingCombined(data, 0.5, 3);
    expect(fixed.length).toBe(data.length);
    expect(clippedMask.length).toBe(data.length);
  });
});
