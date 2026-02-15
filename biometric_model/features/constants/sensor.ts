/**
 * Sensor Configuration
 *
 * Sensor sampling rates and frame sizes.
 * These must match the Bangle.js firmware binary format.
 *
 * Ported from: MaonV3/Services/ProtocolConstants.swift (SensorConfig)
 */

// ============================================================================
// PPG (Photoplethysmography) CONFIGURATION
// ============================================================================

export const PPGConfig = {
  /**
   * PPG sampling rate in Hz. Matches CONFIG.PPG_HZ in Bangle.js.
   */
  SAMPLE_RATE_HZ: 25.0,

  /**
   * PPG sync interval in ms (one frame per second).
   */
  SYNC_INTERVAL_MS: 1000,

  /**
   * PPG frame size: 4-byte timestamp + 25 × 2-byte samples = 54 bytes.
   */
  FRAME_SIZE: 54,

  /**
   * Number of samples per frame.
   */
  SAMPLES_PER_FRAME: 25,

  /**
   * Bytes per sample (uint16).
   */
  BYTES_PER_SAMPLE: 2,

  /**
   * Timestamp size in bytes (uint32).
   */
  TIMESTAMP_SIZE: 4,
} as const;

// ============================================================================
// ACCELEROMETER CONFIGURATION
// ============================================================================

export const AccelConfig = {
  /**
   * Accelerometer sampling rate in Hz. Matches CONFIG.ACCEL_HZ in Bangle.js.
   */
  SAMPLE_RATE_HZ: 12.0,

  /**
   * Accelerometer sync interval in ms (one frame per second).
   */
  SYNC_INTERVAL_MS: 1000,

  /**
   * Accelerometer frame size: 4-byte timestamp + 12 × 6-byte samples = 76 bytes.
   */
  FRAME_SIZE: 76,

  /**
   * Number of samples per frame.
   */
  SAMPLES_PER_FRAME: 12,

  /**
   * Bytes per sample (3 × int16 for x, y, z).
   */
  BYTES_PER_SAMPLE: 6,

  /**
   * Timestamp size in bytes (uint32).
   */
  TIMESTAMP_SIZE: 4,

  /**
   * Q13 fixed-point scale factor for accelerometer values.
   * Divide raw int16 by this to get g-units.
   */
  Q13_SCALE: 8192.0,
} as const;

// ============================================================================
// TEMPERATURE CONFIGURATION
// ============================================================================

export const TempConfig = {
  /**
   * Temperature sampling rate in Hz. Matches CONFIG.TEMP_HZ in Bangle.js.
   */
  SAMPLE_RATE_HZ: 0.1,

  /**
   * Temperature sync interval in ms (one sample per 10 seconds).
   */
  SYNC_INTERVAL_MS: 10000,

  /**
   * Temperature frame size: 4-byte timestamp + 4-byte float = 8 bytes.
   */
  FRAME_SIZE: 8,

  /**
   * Number of samples per frame.
   */
  SAMPLES_PER_FRAME: 1,

  /**
   * Bytes per sample (float32).
   */
  BYTES_PER_SAMPLE: 4,

  /**
   * Timestamp size in bytes (uint32).
   */
  TIMESTAMP_SIZE: 4,
} as const;

// ============================================================================
// COMBINED SENSOR CONFIG
// ============================================================================

/**
 * Combined sensor configuration for convenience.
 */
export const SensorConfig = {
  PPG: PPGConfig,
  ACCEL: AccelConfig,
  TEMP: TempConfig,
} as const;

// Type exports
export type PPGConfigType = typeof PPGConfig;
export type AccelConfigType = typeof AccelConfig;
export type TempConfigType = typeof TempConfig;
export type SensorConfigType = typeof SensorConfig;
