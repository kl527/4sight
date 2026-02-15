import { describe, it, expect } from "vitest";
import {
  computeAccelFeatures,
  computeAccelFeaturesFrom2D,
  computeBasicMovement,
} from "../accel-features";

describe("computeAccelFeatures", () => {
  it("returns zeros for empty input", () => {
    const result = computeAccelFeatures([], [], []);
    expect(result.meanX).toBe(0);
    expect(result.meanY).toBe(0);
    expect(result.meanZ).toBe(0);
    expect(result.magnitudeMean).toBe(0);
    expect(result.energy).toBe(0);
  });
  it("computes features for stationary sensor", () => {
    // Stationary: gravity vector ~1g in Z
    const n = 50;
    const x = new Array(n).fill(0);
    const y = new Array(n).fill(0);
    const z = new Array(n).fill(1.0);
    const result = computeAccelFeatures(x, y, z);

    expect(result.meanZ).toBeCloseTo(1.0, 1);
    expect(result.magnitudeMean).toBeCloseTo(1.0, 1);
    expect(result.magnitudeStd).toBeCloseTo(0, 1);
    expect(result.intensity).toBeCloseTo(0, 1);
  });
  it("detects movement", () => {
    const n = 50;
    const x: number[] = [];
    const y: number[] = [];
    const z: number[] = [];
    for (let i = 0; i < n; i++) {
      x.push(Math.sin(i * 0.5) * 0.5);
      y.push(Math.cos(i * 0.5) * 0.3);
      z.push(1.0 + Math.sin(i * 0.3) * 0.2);
    }
    const result = computeAccelFeatures(x, y, z);
    expect(result.magnitudeStd).toBeGreaterThan(0);
    expect(result.intensity).toBeGreaterThan(0);
    expect(result.energy).toBeGreaterThan(0);
  });
});

describe("computeAccelFeaturesFrom2D", () => {
  it("handles 2D array format", () => {
    const data = [
      [0, 0, 1],
      [0.1, 0, 1],
      [0, 0.1, 1],
      [0, 0, 1.1],
    ];
    const result = computeAccelFeaturesFrom2D(data);
    expect(result.magnitudeMean).toBeGreaterThan(0);
  });
  it("skips rows with fewer than 3 elements", () => {
    const data = [[0, 0], [1, 2, 3]];
    const result = computeAccelFeaturesFrom2D(data);
    expect(result.magnitudeMean).toBeGreaterThan(0);
  });
});

describe("computeBasicMovement", () => {
  it("returns zeros for empty input", () => {
    const result = computeBasicMovement([], [], []);
    expect(result.magnitudeMean).toBe(0);
    expect(result.magnitudeStd).toBe(0);
  });
  it("computes magnitude stats", () => {
    const result = computeBasicMovement([1, 0, 0], [0, 1, 0], [0, 0, 1]);
    expect(result.magnitudeMean).toBeCloseTo(1.0);
    expect(result.magnitudeStd).toBeCloseTo(0);
  });
});
