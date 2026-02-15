import { describe, it, expect } from "vitest";
import {
  mean,
  std,
  sampleStd,
  median,
  iqr,
  percentile,
  q1,
  q3,
  min,
  max,
  range,
  sum,
  rms,
  variance,
  mad,
  normalize,
} from "../statistics";

describe("mean", () => {
  it("returns 0 for empty array", () => {
    expect(mean([])).toBe(0);
  });
  it("computes mean of positive numbers", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });
  it("handles single element", () => {
    expect(mean([42])).toBe(42);
  });
  it("handles negative numbers", () => {
    expect(mean([-2, 0, 2])).toBe(0);
  });
});

describe("std", () => {
  it("returns 0 for empty or single-element array", () => {
    expect(std([])).toBe(0);
    expect(std([5])).toBe(0);
  });
  it("computes population std", () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] — population std = 2.0
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0, 5);
  });
  it("returns 0 for constant array", () => {
    expect(std([3, 3, 3, 3])).toBe(0);
  });
});

describe("sampleStd", () => {
  it("returns 0 for empty or single-element array", () => {
    expect(sampleStd([])).toBe(0);
    expect(sampleStd([5])).toBe(0);
  });
  it("uses Bessel's correction", () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] — sample std ≈ 2.138
    expect(sampleStd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });
});

describe("median", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });
  it("returns middle value for odd-length array", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("returns average of two middle values for even-length", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("does not mutate input", () => {
    const arr = [3, 1, 2];
    median(arr);
    expect(arr).toEqual([3, 1, 2]);
  });
});

describe("iqr", () => {
  it("returns 0 for short arrays", () => {
    expect(iqr([])).toBe(0);
    expect(iqr([1, 2, 3])).toBe(0);
  });
  it("computes IQR for sorted data", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(iqr(data)).toBeGreaterThan(0);
  });
});

describe("percentile", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });
  it("returns min at 0th percentile", () => {
    expect(percentile([10, 20, 30, 40, 50], 0)).toBe(10);
  });
  it("returns max at 100th percentile", () => {
    expect(percentile([10, 20, 30, 40, 50], 100)).toBe(50);
  });
});

describe("q1 and q3", () => {
  it("q1 returns 25th percentile", () => {
    expect(q1([1, 2, 3, 4, 5])).toBe(2);
  });
  it("q3 returns 75th percentile", () => {
    expect(q3([1, 2, 3, 4, 5])).toBe(4);
  });
});

describe("min and max", () => {
  it("return 0 for empty array", () => {
    expect(min([])).toBe(0);
    expect(max([])).toBe(0);
  });
  it("find min and max", () => {
    expect(min([3, -1, 7, 2])).toBe(-1);
    expect(max([3, -1, 7, 2])).toBe(7);
  });
});

describe("range", () => {
  it("returns 0 for empty array", () => {
    expect(range([])).toBe(0);
  });
  it("computes max - min", () => {
    expect(range([2, 8, 5])).toBe(6);
  });
});

describe("sum", () => {
  it("returns 0 for empty array", () => {
    expect(sum([])).toBe(0);
  });
  it("sums values", () => {
    expect(sum([1, 2, 3])).toBe(6);
  });
});

describe("rms", () => {
  it("returns 0 for empty array", () => {
    expect(rms([])).toBe(0);
  });
  it("computes root mean square", () => {
    // RMS of [3, 4] = sqrt((9+16)/2) = sqrt(12.5) ≈ 3.536
    expect(rms([3, 4])).toBeCloseTo(3.536, 2);
  });
});

describe("variance", () => {
  it("returns 0 for short arrays", () => {
    expect(variance([])).toBe(0);
    expect(variance([1])).toBe(0);
  });
  it("computes population variance", () => {
    // var([2,4,4,4,5,5,7,9]) = 4.0
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4.0, 5);
  });
});

describe("mad", () => {
  it("returns 0 for empty array", () => {
    expect(mad([])).toBe(0);
  });
  it("computes median absolute deviation", () => {
    // [1, 1, 2, 2, 4, 6, 9] → median=2, deviations=[1,1,0,0,2,4,7] → MAD=1
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1);
  });
});

describe("normalize", () => {
  it("returns empty for empty input", () => {
    expect(normalize([])).toEqual([]);
  });
  it("normalizes to [0, 1]", () => {
    const result = normalize([10, 20, 30]);
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(0.5);
    expect(result[2]).toBeCloseTo(1);
  });
  it("returns zeros for constant data", () => {
    expect(normalize([5, 5, 5])).toEqual([0, 0, 0]);
  });
});
