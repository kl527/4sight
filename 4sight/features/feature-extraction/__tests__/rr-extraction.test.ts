import { describe, it, expect } from "vitest";
import {
  findPeaks,
  rrToHeartRate,
  successiveDifferences,
  extractRRIntervalsWithDiagnostics,
} from "../rr-extraction";
import { DEFAULT_PPG_CONFIG } from "@/features/signal-processing/types";

describe("findPeaks", () => {
  it("returns empty for short signals", () => {
    expect(findPeaks([], 1)).toEqual([]);
    expect(findPeaks([1], 1)).toEqual([]);
    expect(findPeaks([1, 2], 1)).toEqual([]);
  });
  it("finds simple peaks", () => {
    const signal = [0, 1, 0, 1, 0];
    const peaks = findPeaks(signal, 1);
    expect(peaks).toEqual([1, 3]);
  });
  it("respects minimum distance", () => {
    const signal = [0, 5, 0, 3, 0, 4, 0];
    const peaks = findPeaks(signal, 3);
    // With minDistance=3, can't have peaks closer than 3 apart
    expect(peaks.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i] - peaks[i - 1]).toBeGreaterThanOrEqual(3);
    }
  });
  it("replaces peak when higher peak found within minDistance", () => {
    // Peak at idx 1 (value 3), then higher peak at idx 2 (value 5) within minDistance
    const signal = [0, 3, 5, 0, 0, 0, 1, 0];
    const peaks = findPeaks(signal, 3);
    expect(peaks).toContain(2);
    expect(peaks).not.toContain(1);
  });
});

describe("rrToHeartRate", () => {
  it("converts RR intervals to BPM", () => {
    const rr = [1000, 500, 750]; // 60, 120, 80 BPM
    const hr = rrToHeartRate(rr);
    expect(hr[0]).toBeCloseTo(60);
    expect(hr[1]).toBeCloseTo(120);
    expect(hr[2]).toBeCloseTo(80);
  });
});

describe("successiveDifferences", () => {
  it("returns empty for single element", () => {
    expect(successiveDifferences([100])).toEqual([]);
  });
  it("computes successive differences", () => {
    const rr = [800, 850, 780, 900];
    const diffs = successiveDifferences(rr);
    expect(diffs).toEqual([50, -70, 120]);
  });
});

describe("extractRRIntervalsWithDiagnostics", () => {
  it("fails with insufficient peaks on flat signal", () => {
    const flat = new Array(100).fill(1);
    const { result, failureReason } = extractRRIntervalsWithDiagnostics(
      flat,
      25,
      DEFAULT_PPG_CONFIG
    );
    expect(result).toBeNull();
    expect(failureReason?.type).toBe("insufficientPeaks");
  });
  it("extracts RR intervals from synthetic PPG", () => {
    // Generate Gaussian peaks at 1 Hz intervals (60 BPM)
    const sampleRate = 25;
    const duration = 10;
    const n = sampleRate * duration;
    const signal = new Array(n).fill(0);
    const peakWidth = 2; // samples — narrow Gaussian
    for (let peakTime = 0.5; peakTime < duration; peakTime += 1.0) {
      const peakSample = Math.round(peakTime * sampleRate);
      for (let j = -5; j <= 5; j++) {
        const idx = peakSample + j;
        if (idx >= 0 && idx < n) {
          signal[idx] += Math.exp(-(j * j) / (2 * peakWidth * peakWidth));
        }
      }
    }
    const { result, failureReason } = extractRRIntervalsWithDiagnostics(
      signal,
      sampleRate,
      DEFAULT_PPG_CONFIG
    );
    expect(failureReason).toBeNull();
    expect(result).not.toBeNull();
    expect(result!.validRR.length).toBeGreaterThan(0);
    // RR intervals should be around 1000ms (60 BPM)
    for (const rr of result!.validRR) {
      expect(rr).toBeGreaterThan(800);
      expect(rr).toBeLessThan(1200);
    }
  });
});
