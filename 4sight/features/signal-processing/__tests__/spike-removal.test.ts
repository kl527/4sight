import { describe, it, expect } from "vitest";
import {
  gradientSpikeRemoval,
  detectSpikesSecondDerivative,
  combinedSpikeRemoval,
} from "../spike-removal";

describe("gradientSpikeRemoval", () => {
  it("returns copy for empty or single-element", () => {
    expect(gradientSpikeRemoval([]).filtered).toEqual([]);
    expect(gradientSpikeRemoval([5]).filtered).toEqual([5]);
    expect(gradientSpikeRemoval([5]).spikeMask).toEqual([false]);
  });
  it("detects and removes spike", () => {
    const data = [1, 1, 1, 1, 100, 1, 1, 1, 1];
    const { filtered, spikeMask } = gradientSpikeRemoval(data, 3.0);
    expect(spikeMask[4]).toBe(true);
    // Spike should be interpolated away
    expect(filtered[4]).toBeLessThan(50);
  });
  it("leaves clean signal untouched", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { spikeMask } = gradientSpikeRemoval(data, 5.0);
    expect(spikeMask.every((v: boolean) => !v)).toBe(true);
  });
});

describe("detectSpikesSecondDerivative", () => {
  it("returns all-false for short signals", () => {
    expect(detectSpikesSecondDerivative([])).toEqual([]);
    expect(detectSpikesSecondDerivative([1])).toEqual([false]);
    expect(detectSpikesSecondDerivative([1, 2])).toEqual([false, false]);
  });
  it("detects spike via second derivative", () => {
    const data = [0, 0, 0, 0, 100, 0, 0, 0, 0];
    const mask = detectSpikesSecondDerivative(data, 3.0);
    // The spike and its neighbors should have large second derivatives
    const spikeDetected = mask.some((v: boolean) => v);
    expect(spikeDetected).toBe(true);
  });
});

describe("combinedSpikeRemoval", () => {
  it("combines both methods", () => {
    const data = [1, 1, 1, 1, 100, 1, 1, 1, 1];
    const { filtered, spikeMask } = combinedSpikeRemoval(data, 3.0, 3.0);
    expect(spikeMask.some((v: boolean) => v)).toBe(true);
    expect(filtered.length).toBe(data.length);
  });
});
