import { describe, it, expect } from "vitest";
import { robustScale } from "../scaler";

describe("robustScale", () => {
  it("applies (x - center) / scale", () => {
    const features = [10, 20, 30];
    const center = [5, 10, 15];
    const scale = [2, 5, 10];
    const result = robustScale(features, center, scale);
    expect(result).toEqual([2.5, 2, 1.5]);
  });
  it("uses 1 when scale is 0", () => {
    const features = [10, 20];
    const center = [5, 10];
    const scale = [0, 5];
    const result = robustScale(features, center, scale);
    expect(result[0]).toBe(5); // (10 - 5) / 1
    expect(result[1]).toBe(2); // (20 - 10) / 5
  });
  it("handles negative values", () => {
    const result = robustScale([-5], [0], [2]);
    expect(result).toEqual([-2.5]);
  });
});
