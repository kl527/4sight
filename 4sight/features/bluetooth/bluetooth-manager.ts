/**
 * Bluetooth Manager for 4sight firmware.
 *
 * Manages BLE communication with Bangle.js 2 running the 4sight sensor logger.
 * Handles scanning, connection, command dispatch, status polling, and binary
 * window data downloads over Nordic UART Service (NUS).
 *
 * Firmware protocol: JSON commands over UART with X10 framing.
 * See firmware/4sight.js for the full command reference.
 */

import {
  BleManager,
  Device,
  Characteristic,
  State,
  BleError,
} from "react-native-ble-plx";

// ============================================================================
// BLE CONSTANTS
// ============================================================================

const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // Phone writes to this
const NUS_TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // Phone reads from this

const Config = {
  CONNECTION_TIMEOUT_MS: 15_000,
  STATUS_POLL_INTERVAL_MS: 3_000,
  QUEUE_POLL_EVERY_TICKS: 2,
  DOWNLOAD_TIMEOUT_MS: 60_000,
  MAX_CONTROL_LINE_BYTES: 4 * 1024,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type BluetoothState =
  | "unknown"
  | "poweredOn"
  | "poweredOff"
  | "resetting"
  | "unauthorized"
  | "unsupported";
export type ConnectionState =
  | "disconnected"
  | "scanning"
  | "connecting"
  | "connected"
  | "error";

export interface BleDevice {
  id: string;
  name: string;
  rssi: number;
}

/** Mirrors firmware get_status response fields exactly. */
export interface DeviceStatus {
  recording: boolean;
  recordingMode: boolean;
  chunk: number;
  battery: number;
  winId: string | null;
  queueLen: number;
}

export interface TransferResult {
  windowId: string;
  ppgData: Uint8Array;
  accelData: Uint8Array;
  ppgLen: number;
  accelLen: number;
}

export interface BluetoothManagerState {
  bluetoothState: BluetoothState;
  connectionState: ConnectionState;
  isScanning: boolean;
  discoveredDevices: BleDevice[];
  connectedDeviceId: string | null;
  connectedDeviceName: string | null;
  deviceStatus: DeviceStatus | null;
  uploadQueue: string[];
  isDownloading: boolean;
  downloadProgress: number;
  lastError: { code: string; message: string; timestamp: number } | null;
}

export type BluetoothManagerEvent =
  | { type: "bluetoothStateChanged"; state: BluetoothState }
  | {
      type: "connectionStateChanged";
      state: ConnectionState;
      deviceName?: string;
    }
  | { type: "deviceDiscovered"; device: BleDevice }
  | { type: "statusUpdated"; status: DeviceStatus }
  | { type: "queueUpdated"; windows: string[] }
  | {
      type: "downloadProgress";
      windowId: string;
      bytesReceived: number;
      totalBytes: number;
      percentage: number;
    }
  | { type: "downloadComplete"; result: TransferResult }
  | {
      type: "error";
      error: { code: string; message: string; timestamp: number };
    };

export type BluetoothEventListener = (event: BluetoothManagerEvent) => void;

// Firmware command types (matches handleCommand switch in 4sight.js)
type FourSightCommand =
  | { type: "start_recording" }
  | { type: "stop_recording" }
  | { type: "get_status" }
  | { type: "get_queue" }
  | { type: "get_window_data"; windowId: string }
  | { type: "confirm_upload"; windowId: string }
  | { type: "delete_all_windows" };

// ============================================================================
// BLUETOOTH MANAGER
// ============================================================================

class BluetoothManagerClass {
  private manager: BleManager | null = null;
  private connectedDevice: Device | null = null;
  private txCharacteristic: Characteristic | null = null;
  private rxCharacteristic: Characteristic | null = null;
  private notificationSubscription: { remove: () => void } | null = null;
  private disconnectSubscription: { remove: () => void } | null = null;

  private state: BluetoothManagerState = {
    bluetoothState: "unknown",
    connectionState: "disconnected",
    isScanning: false,
    discoveredDevices: [],
    connectedDeviceId: null,
    connectedDeviceName: null,
    deviceStatus: null,
    uploadQueue: [],
    isDownloading: false,
    downloadProgress: 0,
    lastError: null,
  };

  // Negotiated MTU (internal, not exposed in state)
  private negotiatedMtu = 23;

  // Control data buffer for incoming JSON lines
  private controlBuffer = new Uint8Array(4096);
  private controlBufferLength = 0;

  // Binary transfer state
  private transferActive = false;
  private transferWindowId: string | null = null;
  private transferPpgLen = 0;
  private transferAccelLen = 0;
  private transferTotalLen = 0;
  private transferBuffer: Uint8Array = new Uint8Array(0);
  private transferOffset = 0;
  private transferTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Status polling
  private statusPollIntervalId: ReturnType<typeof setInterval> | null = null;
  private statusPollTicks = 0;

  // Connection timeout
  private connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Event listeners
  private listeners = new Set<BluetoothEventListener>();

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  initialize(): void {
    if (this.manager) return;
    try {
      this.manager = new BleManager();
      this.manager.onStateChange(
        (s: State) => this.handleBluetoothStateChange(s),
        true,
      );
      this.log("Initialized");
    } catch (e) {
      console.warn("[BLE] Failed to initialize BleManager:", e);
      this.manager = null;
    }
  }

  destroy(): void {
    this.stopStatusPolling();
    this.clearConnectionTimeout();
    this.cancelTransfer();
    this.notificationSubscription?.remove();
    this.disconnectSubscription?.remove();
    this.manager?.destroy();
    this.manager = null;
    this.connectedDevice = null;
    this.txCharacteristic = null;
    this.rxCharacteristic = null;
    this.controlBufferLength = 0;
    this.listeners.clear();
    this.log("Destroyed");
  }

  // ============================================================================
  // STATE ACCESS
  // ============================================================================

  getState(): BluetoothManagerState {
    return { ...this.state };
  }

  addEventListener(listener: BluetoothEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: BluetoothManagerEvent): void {
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (e) {
        console.error("Event listener error:", e);
      }
    });
  }

  // ============================================================================
  // SCANNING
  // ============================================================================

  startScanning(): void {
    if (!this.manager || !this.isBluetoothReady()) {
      this.handleError("BLUETOOTH_UNAVAILABLE", "Bluetooth not ready");
      return;
    }
    if (this.state.isScanning) return;

    this.state.isScanning = true;
    this.state.discoveredDevices = [];
    this.emit({ type: "connectionStateChanged", state: "scanning" });
    this.log("Scanning...");

    this.manager.startDeviceScan(
      null,
      { allowDuplicates: false },
      (error: BleError | null, device: Device | null) => {
        if (error) {
          this.handleError("SCAN_ERROR", error.message);
          return;
        }
        if (device?.name?.toLowerCase().includes("bangle")) {
          this.handleDeviceDiscovered(device);
        }
      },
    );
  }

  stopScanning(): void {
    if (!this.state.isScanning) return;
    this.manager?.stopDeviceScan();
    this.state.isScanning = false;
    if (this.state.connectionState === "scanning") {
      this.state.connectionState = "disconnected";
      this.emit({ type: "connectionStateChanged", state: "disconnected" });
    }
    this.log("Scan stopped");
  }

  private handleDeviceDiscovered(device: Device): void {
    const bleDevice: BleDevice = {
      id: device.id,
      name: device.name || "Bangle.js",
      rssi: device.rssi || -100,
    };
    const idx = this.state.discoveredDevices.findIndex(
      (d) => d.id === device.id,
    );
    if (idx >= 0) {
      this.state.discoveredDevices[idx] = bleDevice;
    } else {
      this.state.discoveredDevices.push(bleDevice);
      this.log(`Found: ${bleDevice.name} (${bleDevice.id})`);
    }
    this.emit({ type: "deviceDiscovered", device: bleDevice });
  }

  // ============================================================================
  // CONNECTION
  // ============================================================================

  async connect(deviceId: string): Promise<void> {
    if (!this.manager) throw new Error("BLE manager not initialized");
    if (!this.isBluetoothReady()) throw new Error("Bluetooth not ready");
    if (this.state.connectionState === "connected")
      throw new Error("Already connected");

    this.stopScanning();
    this.state.lastError = null;

    const device = this.state.discoveredDevices.find((d) => d.id === deviceId);
    const deviceName = device?.name || "Unknown";

    this.state.connectionState = "connecting";
    this.state.connectedDeviceId = deviceId;
    this.state.connectedDeviceName = deviceName;
    this.emit({
      type: "connectionStateChanged",
      state: "connecting",
      deviceName,
    });
    this.log(`Connecting to ${deviceName}...`);

    this.connectionTimeoutId = setTimeout(() => {
      this.handleConnectionTimeout(deviceId);
    }, Config.CONNECTION_TIMEOUT_MS);

    try {
      const connected = await this.manager.connectToDevice(deviceId, {
        timeout: Config.CONNECTION_TIMEOUT_MS,
      });
      await connected.discoverAllServicesAndCharacteristics();

      // Negotiate MTU
      try {
        const withMtu = await connected.requestMTU(512);
        this.negotiatedMtu = withMtu.mtu ?? 23;
        this.log(`MTU: ${this.negotiatedMtu}`);
      } catch {
        this.negotiatedMtu = 23;
      }

      // Find NUS service + characteristics
      const services = await connected.services();
      const nus = services.find(
        (s: { uuid: string }) => s.uuid.toLowerCase() === NUS_SERVICE_UUID,
      );
      if (!nus) throw new Error("NUS service not found");

      const chars = await nus.characteristics();
      this.txCharacteristic =
        chars.find(
          (c: Characteristic) => c.uuid.toLowerCase() === NUS_TX_CHAR_UUID,
        ) || null;
      this.rxCharacteristic =
        chars.find(
          (c: Characteristic) => c.uuid.toLowerCase() === NUS_RX_CHAR_UUID,
        ) || null;
      if (!this.txCharacteristic || !this.rxCharacteristic)
        throw new Error("NUS characteristics not found");

      // Subscribe to notifications (incoming data from watch)
      this.notificationSubscription = this.txCharacteristic.monitor(
        (error: BleError | null, char: Characteristic | null) => {
          if (error) {
            this.log(`Notification error: ${error.message}`);
            return;
          }
          if (char?.value) this.handleIncomingData(char.value);
        },
      );

      this.connectedDevice = connected;

      // Disconnection handler
      this.disconnectSubscription?.remove();
      this.disconnectSubscription = this.manager.onDeviceDisconnected(
        deviceId,
        (err: BleError | null) => {
          this.handleDisconnection(err ?? undefined);
        },
      );

      this.clearConnectionTimeout();
      this.state.connectionState = "connected";
      this.emit({
        type: "connectionStateChanged",
        state: "connected",
        deviceName,
      });
      this.log(`Connected to ${deviceName}`);

      // Start polling
      this.startStatusPolling();
      setTimeout(() => {
        this.requestStatus();
        this.requestQueue();
      }, 300);
    } catch (error) {
      this.clearConnectionTimeout();
      this.state.connectionState = "error";
      this.state.connectedDeviceId = null;
      this.state.connectedDeviceName = null;
      this.connectedDevice = null;
      const msg = error instanceof Error ? error.message : "Connection failed";
      this.handleError("CONNECTION_FAILED", msg);
      this.emit({ type: "connectionStateChanged", state: "error" });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connectedDevice) return;
    this.log("Disconnecting...");
    this.stopStatusPolling();
    this.clearConnectionTimeout();
    this.cancelTransfer();
    try {
      await this.connectedDevice.cancelConnection();
    } catch {}
    this.cleanupConnection();
    this.state.connectionState = "disconnected";
    this.emit({ type: "connectionStateChanged", state: "disconnected" });
  }

  private handleDisconnection(error?: BleError): void {
    this.log(error ? `Disconnected: ${error.message}` : "Disconnected");
    this.cleanupConnection();
    this.state.connectionState = "disconnected";
    this.emit({ type: "connectionStateChanged", state: "disconnected" });
  }

  private handleConnectionTimeout(deviceId: string): void {
    this.log("Connection timeout");
    this.manager?.cancelDeviceConnection(deviceId).catch(() => {});
    this.cleanupConnection();
    this.state.connectionState = "error";
    this.handleError("CONNECTION_TIMEOUT", "Connection timed out");
    this.emit({ type: "connectionStateChanged", state: "error" });
  }

  private cleanupConnection(): void {
    this.stopStatusPolling();
    this.cancelTransfer();
    this.notificationSubscription?.remove();
    this.notificationSubscription = null;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    this.connectedDevice = null;
    this.txCharacteristic = null;
    this.rxCharacteristic = null;
    this.controlBufferLength = 0;
    this.negotiatedMtu = 23;
    this.state.connectedDeviceId = null;
    this.state.connectedDeviceName = null;
    this.state.deviceStatus = null;
    this.state.uploadQueue = [];
    this.state.isDownloading = false;
    this.state.downloadProgress = 0;
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
  }

  // ============================================================================
  // COMMAND SENDING
  // ============================================================================

  sendCommand(command: FourSightCommand): void {
    if (!this.connectedDevice || !this.rxCharacteristic) return;

    const json = JSON.stringify(command);
    // Raw JSON — firmware UART handler accepts bare {…}\n lines
    this.writeToBle(`${json}\n`);
  }

  private async writeToBle(data: string): Promise<void> {
    const characteristic = this.rxCharacteristic;
    if (!characteristic) return;

    try {
      // Convert string to bytes so control chars (like \x10) survive base64 round-trip
      const bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);

      // Chunk to fit within MTU
      const mtuPayload = Math.max(20, (this.negotiatedMtu || 23) - 3);

      for (let i = 0; i < bytes.length; i += mtuPayload) {
        const chunk = bytes.subarray(i, Math.min(i + mtuPayload, bytes.length));
        const b64 = this.uint8ToBase64(chunk);
        await this.writeWithTimeout(characteristic, b64);
        if (i + mtuPayload < bytes.length) {
          await new Promise((r) => setTimeout(r, 5));
        }
      }
    } catch (error) {
      this.log(`BLE write error: ${error}`);
    }
  }

  private uint8ToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private async writeWithTimeout(
    characteristic: Characteristic,
    data: string,
    timeoutMs = 5000,
  ): Promise<void> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("BLE write timeout")), timeoutMs);
    });
    await Promise.race([characteristic.writeWithoutResponse(data), timeout]);
  }

  // ============================================================================
  // INCOMING DATA
  // ============================================================================

  private handleIncomingData(base64Data: string): void {
    const raw = atob(base64Data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    // this.log(`RX ${bytes.length} bytes`);

    // Route binary data during active transfer
    if (this.transferActive) {
      this.handleTransferData(bytes);
      return;
    }

    // Buffer control data and extract JSON lines
    this.appendToControlBuffer(bytes);
    this.processControlBuffer();
  }

  private appendToControlBuffer(data: Uint8Array): void {
    if (this.controlBufferLength + data.length > this.controlBuffer.length) {
      const newSize = Math.max(
        this.controlBuffer.length * 2,
        this.controlBufferLength + data.length + 1024,
      );
      const newBuf = new Uint8Array(newSize);
      newBuf.set(this.controlBuffer.subarray(0, this.controlBufferLength));
      this.controlBuffer = newBuf;
    }
    this.controlBuffer.set(data, this.controlBufferLength);
    this.controlBufferLength += data.length;
  }

  private processControlBuffer(): void {
    const NL = 0x0a;

    // Overflow protection
    if (this.controlBufferLength > Config.MAX_CONTROL_LINE_BYTES) {
      let hasNl = false;
      for (let i = 0; i < this.controlBufferLength; i++) {
        if (this.controlBuffer[i] === NL) {
          hasNl = true;
          break;
        }
      }
      if (!hasNl) {
        this.log(
          `Control buffer overflow (${this.controlBufferLength} bytes), clearing`,
        );
        this.controlBufferLength = 0;
        return;
      }
    }

    while (true) {
      let nlIdx = -1;
      for (let i = 0; i < this.controlBufferLength; i++) {
        if (this.controlBuffer[i] === NL) {
          nlIdx = i;
          break;
        }
      }
      if (nlIdx === -1) break;

      const line = new TextDecoder()
        .decode(this.controlBuffer.subarray(0, nlIdx))
        .trim();
      this.controlBuffer.copyWithin(0, nlIdx + 1, this.controlBufferLength);
      this.controlBufferLength -= nlIdx + 1;

      if (line.startsWith("{")) {
        this.handleJsonLine(line);
      }
    }
  }

  private handleJsonLine(line: string): void {
    // Handle concatenated JSON objects
    if (line.includes("}{")) {
      const parts = line.split("}{");
      for (let i = 0; i < parts.length; i++) {
        let s = parts[i];
        if (i > 0) s = "{" + s;
        if (i < parts.length - 1) s += "}";
        this.parseAndHandle(s);
      }
      return;
    }
    this.parseAndHandle(line);
  }

  private parseAndHandle(jsonStr: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(jsonStr);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== "string") return;

    switch (msg.type) {
      case "status":
        this.handleStatusResponse(msg);
        break;
      case "queue":
        this.handleQueueResponse(msg);
        break;
      case "window_data":
        this.handleWindowDataHeader(msg);
        break;
      case "end":
        this.handleTransferEnd(msg);
        break;
      case "ack":
        this.handleAck(msg);
        break;
      case "error":
        this.log(`Device error: cmd=${msg.cmd}, message=${msg.message}`);
        break;
      default:
        this.log(`Unknown response type: ${msg.type}`);
    }
  }

  // ============================================================================
  // RESPONSE HANDLERS
  // ============================================================================

  private handleStatusResponse(msg: Record<string, unknown>): void {
    const status: DeviceStatus = {
      recording: Boolean(msg.recording),
      recordingMode: Boolean(msg.recordingMode),
      chunk: typeof msg.chunk === "number" ? msg.chunk : 0,
      battery: typeof msg.battery === "number" ? msg.battery : -1,
      winId: typeof msg.winId === "string" ? msg.winId : null,
      queueLen: typeof msg.queueLen === "number" ? msg.queueLen : 0,
    };
    this.state.deviceStatus = status;
    this.emit({ type: "statusUpdated", status });
  }

  private handleAck(msg: Record<string, unknown>): void {
    const cmd = msg.cmd as string | undefined;
    if (cmd === "start_recording") {
      // Optimistically update so UI reacts immediately
      if (this.state.deviceStatus) {
        this.state.deviceStatus = {
          ...this.state.deviceStatus,
          recording: true,
          recordingMode: true,
        };
        this.emit({ type: "statusUpdated", status: this.state.deviceStatus });
      }
      // Also request authoritative status from the device
      this.requestStatus();
    } else if (cmd === "stop_recording") {
      if (this.state.deviceStatus) {
        this.state.deviceStatus = {
          ...this.state.deviceStatus,
          recording: false,
          recordingMode: false,
        };
        this.emit({ type: "statusUpdated", status: this.state.deviceStatus });
      }
      this.requestStatus();
    }
  }

  private handleQueueResponse(msg: Record<string, unknown>): void {
    const windows = Array.isArray(msg.windows) ? (msg.windows as string[]) : [];
    const prevLen = this.state.uploadQueue.length;
    this.state.uploadQueue = windows;
    if (windows.length !== prevLen) {
      this.log(`Queue: ${windows.length} windows`);
    }
    this.emit({ type: "queueUpdated", windows });
  }

  // ============================================================================
  // BINARY TRANSFER (window download)
  // ============================================================================

  private handleWindowDataHeader(msg: Record<string, unknown>): void {
    if (this.transferActive) {
      this.log("Transfer already active, ignoring header");
      return;
    }
    const windowId = String(msg.windowId ?? "");
    const ppgLen = typeof msg.ppgLen === "number" ? msg.ppgLen : 0;
    const accelLen = typeof msg.accelLen === "number" ? msg.accelLen : 0;
    const totalLength =
      typeof msg.totalLength === "number" ? msg.totalLength : ppgLen + accelLen;

    this.log(
      `Transfer header: windowId=${windowId}, ppg=${ppgLen}, accel=${accelLen}, total=${totalLength}`,
    );

    this.transferWindowId = windowId;
    this.transferPpgLen = ppgLen;
    this.transferAccelLen = accelLen;
    this.transferTotalLen = totalLength;

    if (totalLength === 0) {
      // Empty window — wait for end marker
      return;
    }

    this.transferActive = true;
    this.transferBuffer = new Uint8Array(totalLength);
    this.transferOffset = 0;

    // Watchdog timeout
    this.transferTimeoutId = setTimeout(() => {
      this.log(`Transfer timeout for ${windowId}`);
      this.cancelTransfer();
      this.state.isDownloading = false;
      this.startStatusPolling();
    }, Config.DOWNLOAD_TIMEOUT_MS);
  }

  private handleTransferData(data: Uint8Array): void {
    if (!this.transferActive) return;

    const remaining = this.transferTotalLen - this.transferOffset;
    if (data.length <= remaining) {
      this.transferBuffer.set(data, this.transferOffset);
      this.transferOffset += data.length;
    } else {
      // Some binary, some control data mixed in
      this.transferBuffer.set(data.subarray(0, remaining), this.transferOffset);
      this.transferOffset += remaining;
      // Route leftover to control buffer
      const leftover = data.subarray(remaining);
      this.transferActive = false;
      this.appendToControlBuffer(leftover);
      this.processControlBuffer();
    }

    // Emit progress
    if (this.transferTotalLen > 0) {
      const pct = Math.round(
        (this.transferOffset / this.transferTotalLen) * 100,
      );
      this.state.downloadProgress = pct;
      this.emit({
        type: "downloadProgress",
        windowId: this.transferWindowId!,
        bytesReceived: this.transferOffset,
        totalBytes: this.transferTotalLen,
        percentage: pct,
      });
    }

    // All bytes received — transfer complete (end marker may follow as JSON)
    if (this.transferOffset >= this.transferTotalLen) {
      this.transferActive = false;
    }
  }

  private handleTransferEnd(msg: Record<string, unknown>): void {
    const windowId = String(msg.windowId ?? this.transferWindowId ?? "");
    if (this.transferTimeoutId) {
      clearTimeout(this.transferTimeoutId);
      this.transferTimeoutId = null;
    }

    const result: TransferResult = {
      windowId,
      ppgData: this.transferBuffer.slice(0, this.transferPpgLen),
      accelData: this.transferBuffer.slice(
        this.transferPpgLen,
        this.transferPpgLen + this.transferAccelLen,
      ),
      ppgLen: this.transferPpgLen,
      accelLen: this.transferAccelLen,
    };

    this.log(`Transfer complete: ${windowId} (${this.transferOffset} bytes)`);

    // Reset transfer state
    this.transferActive = false;
    this.transferWindowId = null;
    this.transferBuffer = new Uint8Array(0);
    this.transferOffset = 0;
    this.transferTotalLen = 0;
    this.transferPpgLen = 0;
    this.transferAccelLen = 0;

    this.state.isDownloading = false;
    this.state.downloadProgress = 0;
    this.emit({ type: "downloadComplete", result });
    this.startStatusPolling();
  }

  private cancelTransfer(): void {
    if (this.transferTimeoutId) {
      clearTimeout(this.transferTimeoutId);
      this.transferTimeoutId = null;
    }
    this.transferActive = false;
    this.transferWindowId = null;
    this.transferBuffer = new Uint8Array(0);
    this.transferOffset = 0;
    this.transferTotalLen = 0;
    this.transferPpgLen = 0;
    this.transferAccelLen = 0;
  }

  // ============================================================================
  // STATUS POLLING
  // ============================================================================

  private startStatusPolling(): void {
    if (this.statusPollIntervalId) return;
    this.statusPollTicks = 0;
    this.statusPollIntervalId = setInterval(
      () => this.pollStatus(),
      Config.STATUS_POLL_INTERVAL_MS,
    );
  }

  private stopStatusPolling(): void {
    if (this.statusPollIntervalId) {
      clearInterval(this.statusPollIntervalId);
      this.statusPollIntervalId = null;
    }
  }

  private pollStatus(): void {
    if (this.state.isDownloading) return;
    this.requestStatus();
    this.statusPollTicks++;
    if (this.statusPollTicks % Config.QUEUE_POLL_EVERY_TICKS === 0) {
      this.requestQueue();
    }
  }

  // ============================================================================
  // PUBLIC COMMANDS
  // ============================================================================

  requestStatus(): void {
    this.sendCommand({ type: "get_status" });
  }

  requestQueue(): void {
    this.sendCommand({ type: "get_queue" });
  }

  startRecording(): void {
    this.sendCommand({ type: "start_recording" });
  }

  stopRecording(): void {
    this.sendCommand({ type: "stop_recording" });
  }

  downloadWindow(windowId: string): void {
    if (this.state.isDownloading) {
      this.log("Download already in progress");
      return;
    }
    this.state.isDownloading = true;
    this.state.downloadProgress = 0;
    this.stopStatusPolling();
    this.log(`Requesting window data: ${windowId}`);
    this.sendCommand({ type: "get_window_data", windowId });
  }

  confirmUpload(windowId: string): void {
    this.sendCommand({ type: "confirm_upload", windowId });
  }

  deleteAllWindows(): void {
    this.sendCommand({ type: "delete_all_windows" });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  isBluetoothReady(): boolean {
    return this.state.bluetoothState === "poweredOn";
  }

  isConnected(): boolean {
    return (
      this.state.connectionState === "connected" &&
      this.connectedDevice !== null
    );
  }

  private handleBluetoothStateChange(bleState: State): void {
    const mapped = this.mapState(bleState);
    this.state.bluetoothState = mapped;
    this.emit({ type: "bluetoothStateChanged", state: mapped });
  }

  private mapState(s: State): BluetoothState {
    switch (s) {
      case State.PoweredOn:
        return "poweredOn";
      case State.PoweredOff:
        return "poweredOff";
      case State.Resetting:
        return "resetting";
      case State.Unauthorized:
        return "unauthorized";
      case State.Unsupported:
        return "unsupported";
      default:
        return "unknown";
    }
  }

  private handleError(code: string, message: string): void {
    const error = { code, message, timestamp: Date.now() };
    this.state.lastError = error;
    this.emit({ type: "error", error });
    this.log(`Error: ${code} — ${message}`);
  }

  private log(message: string): void {
    console.log(`[BLE] ${message}`);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const BluetoothManager = new BluetoothManagerClass();
