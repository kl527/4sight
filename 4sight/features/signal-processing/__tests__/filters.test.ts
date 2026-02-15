import { describe, it, expect } from "vitest";
import { medianFilter, weightedMedianFilter } from "../filters/median";
import { hampelFilter, iterativeHampel, detectOutliers } from "../filters/hampel";
import {
  butterworthLowpass,
  butterworthHighpass,
  butterworthBandpass,
  lfilter,
  filtfilt,
} from "../filters/butterworth";
import { savgolFilter, savgolFilterWithEdges } from "../filters/savgol";

describe("medianFilter", () => {
  it("returns empty for empty input", () => {
    expect(medianFilter([])).toEqual([]);
  });
  it("returns copy for window size <= 1", () => {
    expect(medianFilter([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });
  it("removes impulse noise", () => {
    const data = [1, 1, 100, 1, 1];
    const result = medianFilter(data, 3);
    expect(result[2]).toBe(1); // spike replaced with median
  });
  it("preserves constant signal", () => {
    const data = [5, 5, 5, 5, 5];
    expect(medianFilter(data, 3)).toEqual([5, 5, 5, 5, 5]);
  });
});

describe("weightedMedianFilter", () => {
  it("returns empty for empty input", () => {
    expect(weightedMedianFilter([])).toEqual([]);
  });
  it("returns copy for window size <= 1", () => {
    expect(weightedMedianFilter([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });
  it("handles short signals", () => {
    const result = weightedMedianFilter([10, 20], 5);
    expect(result.length).toBe(2);
  });
});

describe("hampelFilter", () => {
  it("returns empty for empty input", () => {
    const { filtered, outlierIndices } = hampelFilter([]);
    expect(filtered).toEqual([]);
    expect(outlierIndices).toEqual([]);
  });
  it("detects outlier in smooth signal", () => {
    // Need enough varied data so MAD > 0 in the local window
    const data = [10, 12, 11, 13, 10, 100, 11, 12, 10, 13, 11, 12];
    const { filtered, outlierIndices } = hampelFilter(data, 7, 2.0);
    expect(outlierIndices).toContain(5);
    expect(filtered[5]).toBeLessThan(50); // replaced with local median
  });
  it("leaves clean signal untouched", () => {
    const data = [10, 12, 11, 13, 10, 12, 11];
    const { outlierIndices } = hampelFilter(data, 5, 3.0);
    expect(outlierIndices.length).toBe(0);
  });
});

describe("iterativeHampel", () => {
  it("converges when no outliers", () => {
    const data = [1, 2, 3, 2, 1, 2, 3];
    const { outlierIndices } = iterativeHampel(data, 5, 3.0, 3);
    expect(outlierIndices.length).toBe(0);
  });
  it("handles multiple passes", () => {
    const data = [10, 12, 11, 100, 200, 11, 12, 10, 13, 11];
    const { outlierIndices } = iterativeHampel(data, 7, 2.0, 5);
    expect(outlierIndices.length).toBeGreaterThan(0);
  });
});

describe("detectOutliers", () => {
  it("returns boolean mask", () => {
    const data = [10, 12, 11, 100, 11, 12, 10, 13, 11, 12];
    const mask = detectOutliers(data, 7, 2.0);
    expect(mask.length).toBe(10);
    expect(mask[3]).toBe(true);
  });
});

describe("lfilter", () => {
  it("returns copy for empty coefficients", () => {
    expect(lfilter([1, 2, 3], [], [1])).toEqual([1, 2, 3]);
    expect(lfilter([1, 2, 3], [1], [])).toEqual([1, 2, 3]);
  });
  it("acts as identity with b=[1], a=[1]", () => {
    const data = [1, 2, 3, 4, 5];
    const result = lfilter(data, [1], [1]);
    expect(result).toEqual(data);
  });
  it("applies simple moving average", () => {
    // b = [0.5, 0.5], a = [1] is a 2-point average
    const data = [0, 1, 0, 1, 0];
    const result = lfilter(data, [0.5, 0.5], [1]);
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(0.5);
  });
});

describe("filtfilt", () => {
  it("output has same length as input", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = filtfilt(data, [1], [1]);
    expect(result.length).toBe(data.length);
  });
});

describe("butterworthLowpass", () => {
  it("returns copy for very short signals", () => {
    expect(butterworthLowpass([1, 2], 100, 10)).toEqual([1, 2]);
  });
  it("attenuates high frequencies", () => {
    // Create signal: low freq + high freq
    const n = 200;
    const sampleRate = 100;
    const data: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      data.push(Math.sin(2 * Math.PI * 2 * t) + Math.sin(2 * Math.PI * 40 * t));
    }
    const filtered = butterworthLowpass(data, sampleRate, 10);
    // The high-frequency component should be attenuated
    const midIdx = Math.floor(n / 2);
    const originalPower = data.reduce((s, v) => s + v * v, 0);
    const filteredPower = filtered.reduce((s, v) => s + v * v, 0);
    expect(filteredPower).toBeLessThan(originalPower);
  });
});

describe("butterworthHighpass", () => {
  it("returns copy for very short signals", () => {
    expect(butterworthHighpass([1, 2], 100, 10)).toEqual([1, 2]);
  });
  it("removes DC offset", () => {
    // Constant signal (pure DC) should be attenuated
    const data = new Array(100).fill(5);
    const filtered = butterworthHighpass(data, 100, 1);
    const mean = filtered.reduce((s, v) => s + v, 0) / filtered.length;
    expect(Math.abs(mean)).toBeLessThan(1);
  });
});

describe("butterworthBandpass", () => {
  it("returns copy for very short signals", () => {
    expect(butterworthBandpass([1, 2], 100, 1, 10)).toEqual([1, 2]);
  });
  it("returns copy when low >= high cutoff", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(butterworthBandpass(data, 100, 10, 5)).toEqual(data);
  });
});

describe("savgolFilter", () => {
  it("returns empty for empty input", () => {
    expect(savgolFilter([])).toEqual([]);
  });
  it("returns copy for short signals", () => {
    expect(savgolFilter([1, 2, 3], 11)).toEqual([1, 2, 3]);
  });
  it("smooths noisy signal", () => {
    const n = 50;
    const data: number[] = [];
    for (let i = 0; i < n; i++) {
      data.push(Math.sin(i * 0.2) + (Math.random() - 0.5) * 0.1);
    }
    const filtered = savgolFilter(data, 7, 2);
    expect(filtered.length).toBe(n);
  });
});

describe("savgolFilterWithEdges", () => {
  it("returns empty for empty input", () => {
    expect(savgolFilterWithEdges([])).toEqual([]);
  });
  it("returns same length as input", () => {
    const data = Array.from({ length: 30 }, (_, i) => Math.sin(i * 0.3));
    const result = savgolFilterWithEdges(data, 7, 2);
    expect(result.length).toBe(data.length);
  });
});
