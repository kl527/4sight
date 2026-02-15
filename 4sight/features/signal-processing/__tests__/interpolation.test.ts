import { describe, it, expect } from "vitest";
import {
  lerp,
  linearInterpolate,
  interpolateMultiple,
  fillGaps,
  resample,
} from "../interpolation";

describe("lerp", () => {
  it("returns y0 when x equals x0", () => {
    expect(lerp(0, 10, 1, 20, 0)).toBe(10);
  });
  it("returns y1 when x equals x1", () => {
    expect(lerp(0, 10, 1, 20, 1)).toBe(20);
  });
  it("interpolates midpoint correctly", () => {
    expect(lerp(0, 0, 10, 100, 5)).toBe(50);
  });
  it("returns y0 when x0 equals x1", () => {
    expect(lerp(5, 42, 5, 99, 5)).toBe(42);
  });
});

describe("linearInterpolate", () => {
  it("returns 0 for empty arrays", () => {
    expect(linearInterpolate(5, [], [])).toBe(0);
  });
  it("returns single value for single-element arrays", () => {
    expect(linearInterpolate(5, [3], [10])).toBe(10);
  });
  it("clamps to first value below range", () => {
    expect(linearInterpolate(-1, [0, 10], [100, 200])).toBe(100);
  });
  it("clamps to last value above range", () => {
    expect(linearInterpolate(20, [0, 10], [100, 200])).toBe(200);
  });
  it("interpolates between known points", () => {
    expect(linearInterpolate(5, [0, 10], [0, 100])).toBe(50);
  });
  it("finds correct interval via binary search", () => {
    const xs = [0, 1, 2, 3, 4, 5];
    const ys = [0, 10, 20, 30, 40, 50];
    expect(linearInterpolate(2.5, xs, ys)).toBe(25);
  });
});

describe("interpolateMultiple", () => {
  it("interpolates multiple target points", () => {
    const result = interpolateMultiple(
      [0, 5, 10],
      [0, 10],
      [0, 100]
    );
    expect(result).toEqual([0, 50, 100]);
  });
});

describe("fillGaps", () => {
  it("throws if data and mask have different lengths", () => {
    expect(() => fillGaps([1, 2], [true])).toThrow();
  });
  it("returns copy when no gaps", () => {
    const data = [1, 2, 3];
    const mask = [false, false, false];
    expect(fillGaps(data, mask)).toEqual([1, 2, 3]);
  });
  it("interpolates gap points", () => {
    const data = [0, 999, 10];
    const mask = [false, true, false];
    const result = fillGaps(data, mask);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(5); // linearly interpolated
    expect(result[2]).toBe(10);
  });
  it("returns copy when not enough good points", () => {
    const data = [1, 2, 3];
    const mask = [true, true, false];
    const result = fillGaps(data, mask);
    expect(result).toEqual([1, 2, 3]);
  });
});

describe("resample", () => {
  it("returns empty for empty input", () => {
    expect(resample([], 5)).toEqual([]);
  });
  it("returns empty for zero target length", () => {
    expect(resample([1, 2, 3], 0)).toEqual([]);
  });
  it("repeats single value", () => {
    expect(resample([42], 3)).toEqual([42, 42, 42]);
  });
  it("preserves endpoints when upsampling", () => {
    const result = resample([0, 100], 5);
    expect(result[0]).toBeCloseTo(0);
    expect(result[4]).toBeCloseTo(100);
    expect(result[2]).toBeCloseTo(50);
  });
  it("preserves length when same size", () => {
    const result = resample([10, 20, 30], 3);
    expect(result.length).toBe(3);
    expect(result[0]).toBeCloseTo(10);
    expect(result[2]).toBeCloseTo(30);
  });
});
