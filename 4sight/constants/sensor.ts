/**
 * Sensor Configuration
 *
 * Sensor sampling rates and frame sizes.
 * These must match the Bangle.js firmware binary format.
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
    SAMPLE_RATE_HZ: 12.5,

    /**
     * Accelerometer sync interval in ms (one frame per 2 seconds).
     */
    SYNC_INTERVAL_MS: 2000,

    /**
     * Accelerometer frame size: 4-byte timestamp + 25 × 6-byte samples = 154 bytes.
     */
    FRAME_SIZE: 154,

    /**
     * Number of samples per frame.
     */
    SAMPLES_PER_FRAME: 25,
  
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
  // COMBINED SENSOR CONFIG
  // ============================================================================

  /**
   * Combined sensor configuration for convenience.
   */
  export const SensorConfig = {
    PPG: PPGConfig,
    ACCEL: AccelConfig,
  } as const;

  // Type exports
  export type PPGConfigType = typeof PPGConfig;
  export type AccelConfigType = typeof AccelConfig;
  export type SensorConfigType = typeof SensorConfig;
  