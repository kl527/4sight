/**
 * RobustScaler port: (x - center) / scale
 *
 * Matches sklearn.preprocessing.RobustScaler with default params.
 * center = median, scale = IQR (interquartile range).
 */

/**
 * Scale a feature vector using exported RobustScaler parameters.
 */
export function robustScale(
  features: number[],
  center: number[],
  scale: number[],
): number[] {
  const result = new Array(features.length);
  for (let i = 0; i < features.length; i++) {
    const s = scale[i] !== 0 ? scale[i] : 1;
    result[i] = (features[i] - center[i]) / s;
  }
  return result;
}
