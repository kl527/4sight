/**
 * Butterworth Filters
 *
 * IIR Butterworth filters with zero-phase filtering.
 */
import type { FilterCoefficients } from '../types';

/**
 * Butterworth lowpass filter.
 *
 * @param data Input signal
 * @param sampleRate Sample rate in Hz
 * @param cutoff Cutoff frequency in Hz
 * @param order Filter order (default: 2)
 * @returns Filtered signal
 */
export function butterworthLowpass(
  data: number[],
  sampleRate: number,
  cutoff: number,
  order: number = 2
): number[] {
  if (data.length <= 3) return [...data];

  const nyquist = sampleRate / 2.0;
  const normalizedCutoff = Math.min(Math.max(cutoff / nyquist, 0.01), 0.99);

  const { b, a } = butterworthLowpassCoefficients(normalizedCutoff, order);

  return filtfilt(data, b, a);
}

/**
 * Butterworth highpass filter.
 *
 * @param data Input signal
 * @param sampleRate Sample rate in Hz
 * @param cutoff Cutoff frequency in Hz
 * @param order Filter order (default: 2)
 * @returns Filtered signal
 */
export function butterworthHighpass(
  data: number[],
  sampleRate: number,
  cutoff: number,
  order: number = 2
): number[] {
  if (data.length <= 3) return [...data];

  const nyquist = sampleRate / 2.0;
  const normalizedCutoff = Math.min(Math.max(cutoff / nyquist, 0.01), 0.99);

  const { b, a } = butterworthHighpassCoefficients(normalizedCutoff, order);

  return filtfilt(data, b, a);
}

/**
 * Butterworth bandpass filter.
 *
 * Implemented as cascade of highpass then lowpass filters.
 *
 * @param data Input signal
 * @param sampleRate Sample rate in Hz
 * @param lowCut Low cutoff frequency in Hz
 * @param highCut High cutoff frequency in Hz
 * @param order Filter order (default: 2)
 * @returns Filtered signal
 */
export function butterworthBandpass(
  data: number[],
  sampleRate: number,
  lowCut: number,
  highCut: number,
  order: number = 2
): number[] {
  if (data.length <= 3) return [...data];

  const nyquist = sampleRate / 2.0;
  const normalizedLow = Math.max(lowCut / nyquist, 0.01);
  const normalizedHigh = Math.min(highCut / nyquist, 0.99);

  if (normalizedLow >= normalizedHigh) return [...data];

  // Apply highpass then lowpass (cascade)
  const highpassed = butterworthHighpass(data, sampleRate, lowCut, order);
  return butterworthLowpass(highpassed, sampleRate, highCut, order);
}

/**
 * Compute Butterworth lowpass filter coefficients (2nd order).
 *
 * Uses bilinear transform.
 */
function butterworthLowpassCoefficients(
  normalizedCutoff: number,
  _order: number
): FilterCoefficients {
  // Using bilinear transform for 2nd order Butterworth
  const wc = Math.tan(Math.PI * normalizedCutoff);
  const k1 = Math.SQRT2 * wc;
  const k2 = wc * wc;
  const k3 = 1.0 + k1 + k2;

  const b0 = k2 / k3;
  const b1 = (2.0 * k2) / k3;
  const b2 = k2 / k3;
  const a1 = (2.0 * (k2 - 1.0)) / k3;
  const a2 = (1.0 - k1 + k2) / k3;

  return {
    b: [b0, b1, b2],
    a: [1.0, a1, a2],
  };
}

/**
 * Compute Butterworth highpass filter coefficients (2nd order).
 *
 * Uses bilinear transform.
 */
function butterworthHighpassCoefficients(
  normalizedCutoff: number,
  _order: number
): FilterCoefficients {
  // Using bilinear transform for 2nd order Butterworth highpass
  const wc = Math.tan(Math.PI * normalizedCutoff);
  const k1 = Math.SQRT2 * wc;
  const k2 = wc * wc;
  const k3 = 1.0 + k1 + k2;

  const b0 = 1.0 / k3;
  const b1 = -2.0 / k3;
  const b2 = 1.0 / k3;
  const a1 = (2.0 * (k2 - 1.0)) / k3;
  const a2 = (1.0 - k1 + k2) / k3;

  return {
    b: [b0, b1, b2],
    a: [1.0, a1, a2],
  };
}

/**
 * Zero-phase filtering (forward-backward filtering).
 *
 * Equivalent to scipy's filtfilt. Applies the filter forward, reverses,
 * applies again, then reverses the result. This eliminates phase distortion.
 *
 * @param data Input signal
 * @param b Numerator (feedforward) coefficients
 * @param a Denominator (feedback) coefficients
 * @returns Filtered signal with zero phase shift
 */
export function filtfilt(data: number[], b: number[], a: number[]): number[] {
  // Forward pass
  const forward = lfilter(data, b, a);

  // Reverse
  const reversed = [...forward].reverse();

  // Backward pass
  const backward = lfilter(reversed, b, a);

  // Reverse again
  return backward.reverse();
}

/**
 * Direct Form II Transposed IIR filter.
 *
 * Standard difference equation implementation of an IIR filter.
 *
 * @param data Input signal
 * @param b Numerator (feedforward) coefficients
 * @param a Denominator (feedback) coefficients
 * @returns Filtered signal
 */
export function lfilter(data: number[], b: number[], a: number[]): number[] {
  if (data.length === 0 || b.length === 0 || a.length === 0) {
    return [...data];
  }

  const output = new Array(data.length).fill(0);
  const order = Math.max(b.length, a.length);

  // State variables
  const z = new Array(order).fill(0);

  for (let i = 0; i < data.length; i++) {
    // Calculate output
    output[i] = b[0] * data[i] + z[0];

    // Update state
    for (let j = 0; j < order - 1; j++) {
      const bCoeff = j < b.length - 1 ? b[j + 1] : 0.0;
      const aCoeff = j < a.length - 1 ? a[j + 1] : 0.0;
      z[j] = bCoeff * data[i] - aCoeff * output[i];
      if (j + 1 < order - 1) {
        z[j] += z[j + 1];
      }
    }
  }

  return output;
}

/**
 * Apply IIR filter with initial conditions for edge handling.
 *
 * @param data Input signal
 * @param b Numerator coefficients
 * @param a Denominator coefficients
 * @param zi Initial conditions (same length as max(len(a), len(b)) - 1)
 * @returns Object with filtered output and final conditions
 */
export function lfilterWithZi(
  data: number[],
  b: number[],
  a: number[],
  zi: number[]
): { y: number[]; zf: number[] } {
  if (data.length === 0 || b.length === 0 || a.length === 0) {
    return { y: [...data], zf: [...zi] };
  }

  const output = new Array(data.length).fill(0);
  const order = Math.max(b.length, a.length);

  // State variables (copy initial conditions)
  const z = [...zi];
  while (z.length < order) z.push(0);

  for (let i = 0; i < data.length; i++) {
    // Calculate output
    output[i] = b[0] * data[i] + z[0];

    // Update state
    for (let j = 0; j < order - 1; j++) {
      const bCoeff = j < b.length - 1 ? b[j + 1] : 0.0;
      const aCoeff = j < a.length - 1 ? a[j + 1] : 0.0;
      z[j] = bCoeff * data[i] - aCoeff * output[i];
      if (j + 1 < order - 1) {
        z[j] += z[j + 1];
      }
    }
  }

  return { y: output, zf: z.slice(0, order - 1) };
}
