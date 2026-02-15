/**
 * Compute the 9 derived features that the model expects.
 *
 * Mirrors risk.py _extract_features() lines 248-289.
 */

import type { BiosignalFeatures } from '@/features/feature-extraction/types';

/** Safe value: returns 0 for null/undefined/NaN */
function v(x: number | null | undefined): number {
  return x != null && !isNaN(x) ? x : 0;
}

/**
 * Compute derived features in the exact order the model expects:
 * hr_var_ratio, hr_cv, hrv_balance, hrv_power, sd_ratio,
 * movement_var, recovery_score, hr_per_movement, weighted_sdnn
 */
export function computeDerivedFeatures(f: BiosignalFeatures): number[] {
  const hrMean = v(f.hrMean);
  const hrStd = v(f.hrStd);
  const sdnn = v(f.sdnn);
  const rmssd = v(f.rmssd);
  const sd1 = v(f.sd1);
  const sd2 = v(f.sd2);
  const accelMagnitudeStd = v(f.accelMagnitudeStd);
  const accelMagnitudeMean = v(f.accelMagnitudeMean);
  const pnn50 = v(f.pnn50);
  const movementIntensity = v(f.movementIntensity);
  const qualityScore = v(f.qualityScore);

  return [
    hrStd / (hrMean + 1e-6),                             // hr_var_ratio
    hrMean !== 0 ? hrStd / hrMean : 0,                   // hr_cv
    rmssd / (sdnn + 1e-6),                               // hrv_balance
    Math.sqrt(sdnn * sdnn + rmssd * rmssd),               // hrv_power
    sd1 / (sd2 + 1e-6),                                  // sd_ratio
    accelMagnitudeStd / (accelMagnitudeMean + 1e-6),      // movement_var
    (pnn50 / 100) * rmssd,                                // recovery_score
    hrMean / (movementIntensity + 1e-6),                  // hr_per_movement
    sdnn * qualityScore,                                  // weighted_sdnn
  ];
}
