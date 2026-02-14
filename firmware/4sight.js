// 4sight - Bangle.js 2 Sensor Data Logger (Espruino 2v28+)
// Records PPG (25Hz) and Accelerometer (12.5Hz) as binary 1-minute windows
//
// Binary formats (little-endian):
//   4s_<winId>_p.bin (PPG):   repeating 54-byte frames
//     [uint32 syncTimeMs][uint16 × 25 samples]
//   4s_<winId>_a.bin (Accel): repeating 154-byte frames (2-sec intervals)
//     [uint32 syncTimeMs][int16 x,y,z × 25 samples] (Q13: g × 8192)

// ============================================
// Section 1: Constants & Config
// ============================================
var APP_ID = "4sight";
var Storage = require("Storage");

var CONFIG = {
  PPG_HZ: 25,
  ACCEL_HZ: 12.5,
  ACCEL_SAMPLES_PER_FRAME: 25, // 12.5Hz × 2sec
  PPG_SYNC_MS: 1000,
  ACCEL_SYNC_MS: 2000,
  WINDOW_MS: 60000,
  BASE_PATH: "4s",
};

// ============================================
// Section 2: State
// ============================================
var state = {
  recording: false,
  winId: null,
  startTime: 0,
  windowTimer: null,

  // PPG ring buffer (64-element, bitmask mod)
  ppgRing: new Uint16Array(64),
  ppgRingHead: 0,
  ppgRingLen: 0,

  // Accel flat typed arrays (avoid per-sample object alloc)
  accelBufX: new Float32Array(32),
  accelBufY: new Float32Array(32),
  accelBufZ: new Float32Array(32),
  accelBufLen: 0,

  // Binary output buffers (pre-allocated per window)
  ppgData: null,
  accelData: null,
  ppgOff: 0,
  accelOff: 0,

  // Fixed-step sync timestamps
  lastPpgSync: 0,
  lastAccelSync: 0,
};

// ============================================
// Section 3: Binary Write Helpers
// ============================================
function writeUint32(buf, off, val) {
  "ram"; "jit";
  buf[off] = val & 0xff;
  buf[off + 1] = (val >> 8) & 0xff;
  buf[off + 2] = (val >> 16) & 0xff;
  buf[off + 3] = (val >> 24) & 0xff;
  return off + 4;
}

function writeUint16(buf, off, val) {
  "ram"; "jit";
  buf[off] = val & 0xff;
  buf[off + 1] = (val >> 8) & 0xff;
  return off + 2;
}

function writeInt16(buf, off, val) {
  "ram"; "jit";
  var v = val < 0 ? val + 65536 : val;
  buf[off] = v & 0xff;
  buf[off + 1] = (v >> 8) & 0xff;
  return off + 2;
}

// ============================================
// Section 4: Buffer Allocation & Flush
// ============================================
function allocPpg(ms) {
  // 54 bytes per 1-second frame: 4 sync + 25×2 samples
  var frames = Math.ceil(ms / CONFIG.PPG_SYNC_MS);
  return new Uint8Array(frames * 54);
}

function allocAccel(ms) {
  // 154 bytes per 2-second frame: 4 sync + 25×3×2 samples
  var frames = Math.ceil(ms / CONFIG.ACCEL_SYNC_MS);
  return new Uint8Array(frames * 154);
}

function flushPpg(syncTime) {
  "ram";
  if (!state.ppgData || state.ppgRingLen === 0) return;

  var available = Math.min(state.ppgRingLen, CONFIG.PPG_HZ);
  var frameBytes = 4 + CONFIG.PPG_HZ * 2; // 54

  if (state.ppgOff + frameBytes > state.ppgData.length) return;

  state.ppgOff = writeUint32(state.ppgData, state.ppgOff, syncTime);

  // Read from ring tail (oldest first)
  var tail = (state.ppgRingHead - state.ppgRingLen + 64) & 63;
  for (var i = 0; i < CONFIG.PPG_HZ; i++) {
    var val = i < available ? state.ppgRing[(tail + i) & 63] : 0;
    state.ppgOff = writeUint16(state.ppgData, state.ppgOff, val);
  }

  state.ppgRingLen -= available;
}

function flushAccel(syncTime) {
  "ram";
  if (!state.accelData || state.accelBufLen === 0) return;

  var samplesPerFrame = CONFIG.ACCEL_SAMPLES_PER_FRAME; // 25
  var available = Math.min(state.accelBufLen, samplesPerFrame);
  var frameBytes = 4 + samplesPerFrame * 3 * 2; // 154

  if (state.accelOff + frameBytes > state.accelData.length) return;

  state.accelOff = writeUint32(state.accelData, state.accelOff, syncTime);

  for (var i = 0; i < samplesPerFrame; i++) {
    if (i < available) {
      // Q13 fixed-point: g × 8192
      state.accelOff = writeInt16(state.accelData, state.accelOff, Math.round(state.accelBufX[i] * 8192));
      state.accelOff = writeInt16(state.accelData, state.accelOff, Math.round(state.accelBufY[i] * 8192));
      state.accelOff = writeInt16(state.accelData, state.accelOff, Math.round(state.accelBufZ[i] * 8192));
    } else {
      // Zero-pad if fewer samples than expected
      state.accelOff = writeInt16(state.accelData, state.accelOff, 0);
      state.accelOff = writeInt16(state.accelData, state.accelOff, 0);
      state.accelOff = writeInt16(state.accelData, state.accelOff, 0);
    }
  }

  // Shift remaining samples forward
  var remaining = state.accelBufLen - available;
  for (var j = 0; j < remaining; j++) {
    state.accelBufX[j] = state.accelBufX[available + j];
    state.accelBufY[j] = state.accelBufY[available + j];
    state.accelBufZ[j] = state.accelBufZ[available + j];
  }
  state.accelBufLen = remaining;
}

// ============================================
// Section 5: Sensor Callbacks
// ============================================
function onHRM(d) {
  "ram";
  if (!state.recording) return;

  var raw = d && d.raw;
  if (typeof raw !== "number") return;

  // Push to buffer (O(1), bitmask mod)
  state.ppgRing[state.ppgRingHead] = raw;
  state.ppgRingHead = (state.ppgRingHead + 1) & 63;
  state.ppgRingLen++;

  // Flush complete 1-second frames
  while (state.ppgRingLen >= CONFIG.PPG_HZ) {
    flushPpg(state.lastPpgSync);
    state.lastPpgSync += CONFIG.PPG_SYNC_MS;
  }
}

function onAccel(d) {
  "ram";
  if (!state.recording) return;

  // Flat array append (no object allocation)
  var len = state.accelBufLen;
  state.accelBufX[len] = d.x;
  state.accelBufY[len] = d.y;
  state.accelBufZ[len] = d.z;
  state.accelBufLen = len + 1;

  // Flush complete 2-second frames (25 samples at 12.5Hz)
  while (state.accelBufLen >= CONFIG.ACCEL_SAMPLES_PER_FRAME) {
    flushAccel(state.lastAccelSync);
    state.lastAccelSync += CONFIG.ACCEL_SYNC_MS;
  }
}

// ============================================
// Section 6: Window Lifecycle
// ============================================
function startWindow() {
  var now = Date.now();
  state.winId = String(Math.floor(now));
  state.startTime = now;

  // Reset buffers
  state.ppgRingHead = 0;
  state.ppgRingLen = 0;
  state.accelBufLen = 0;

  // Pre-allocate binary output (exact size, no realloc)
  state.ppgData = allocPpg(CONFIG.WINDOW_MS);
  state.accelData = allocAccel(CONFIG.WINDOW_MS);
  state.ppgOff = 0;
  state.accelOff = 0;

  // Fixed-step sync timestamps
  state.lastPpgSync = now;
  state.lastAccelSync = now;

  state.recording = true;

  // Schedule window end
  state.windowTimer = setTimeout(function() {
    stopWindow();
  }, CONFIG.WINDOW_MS);
}

function stopWindow() {
  state.recording = false;

  if (state.windowTimer) {
    clearTimeout(state.windowTimer);
    state.windowTimer = null;
  }

  // Final flush — drain remaining samples
  while (state.ppgRingLen > 0) {
    flushPpg(state.lastPpgSync);
    state.lastPpgSync += CONFIG.PPG_SYNC_MS;
  }
  while (state.accelBufLen > 0) {
    flushAccel(state.lastAccelSync);
    state.lastAccelSync += CONFIG.ACCEL_SYNC_MS;
  }

  // Save binary blobs to Storage
  var base = CONFIG.BASE_PATH + "_" + state.winId;
  if (state.ppgData && state.ppgOff > 0) {
    Storage.write(base + "_p.bin", state.ppgData, 0, state.ppgOff);
  }
  if (state.accelData && state.accelOff > 0) {
    Storage.write(base + "_a.bin", state.accelData, 0, state.accelOff);
  }

  // Free buffers
  state.ppgData = null;
  state.accelData = null;
  state.winId = null;

  // Start next window
  startWindow();
}

// ============================================
// Section 7: Init & Start
// ============================================
function start() {
  // Disable power save FIRST (prevents accel dropping to 1.25Hz)
  Bangle.setOptions({ powerSave: false });

  // HRM config BEFORE power on
  Bangle.setOptions({ hrmPollInterval: 40, hrmSportMode: -1 });

  // Power on HRM
  Bangle.setHRMPower(1, APP_ID);

  // Wear detect AFTER power on (setHRMPower resets it)
  Bangle.setOptions({ hrmWearDetect: true });

  // Register sensor callbacks
  Bangle.on('HRM-raw', onHRM);
  Bangle.on('accel', onAccel);

  // Start first recording window
  startWindow();

  // Minimal display
  g.clear();
  g.setFont("6x8");
  g.drawString("4sight logging", 10, 10);
}

start();
