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
import { AppState, type AppStateStatus } from "react-native";

import { extract } from "@/features/feature-extraction/feature-extractor";
import { RiskPredictor, type PredictionResult } from "@/features/risk-prediction";
import * as LocalStore from "@/features/storage/local-store";
import { uploadBiometrics } from "@/features/api";

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
  DOWNLOAD_HEADER_TIMEOUT_MS: 10_000,
  DOWNLOAD_END_MARKER_TIMEOUT_MS: 3_000,
  DOWNLOAD_STALL_BASE_MS: 30_000,
  DOWNLOAD_STALL_PER_200_BYTES_MS: 1_000,
  DOWNLOAD_STALL_MAX_MS: 120_000,
  DOWNLOAD_PARTIAL_RATIO_THRESHOLD: 0.9,
  MAX_CONTROL_LINE_BYTES: 4 * 1024,
  AUTO_SYNC_INTER_WINDOW_DELAY_MS: 1_000,
  AUTO_SYNC_RETRY_DELAY_MS: 5_000,
  RECONNECT_MAX_ATTEMPTS: 10,
  RECONNECT_BASE_DELAY_MS: 1_000,
  RECONNECT_MAX_DELAY_MS: 15_000,
} as const;

const X_NOT_DEFINED_REGEX =
  /ReferenceError:\s*["']?X["']?\s+is\s+not\s+defined/i;
const XON = 0x11;
const XOFF = 0x13;
const OPTIONAL_V2_COMMANDS = new Set([
  "set_mtu",
  "cancel_transfer",
  "next_chunk",
  "binary_ack",
]);

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

export interface PartialTransferResult {
  windowId: string;
  bytesReceived: number;
  totalBytes: number;
  ppgData: Uint8Array;
  accelData: Uint8Array;
  reason: string;
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
  isAutoSyncing: boolean;
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
  | { type: "downloadPartial"; result: PartialTransferResult }
  | { type: "downloadComplete"; result: TransferResult }
  | { type: "autoSyncStarted"; windowCount: number }
  | { type: "autoSyncComplete" }
  | { type: "riskPrediction"; result: PredictionResult }
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
  | { type: "set_mtu"; mtu: number; payload: number }
  | { type: "cancel_transfer" }
  | { type: "next_chunk"; windowId: string }
  | { type: "binary_ack"; windowId: string; bytesReceived: number }
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
    isAutoSyncing: false,
    lastError: null,
  };

  // Negotiated MTU (internal, not exposed in state)
  private negotiatedMtu = 23;

  // Control data buffer for incoming JSON lines
  private controlBuffer = new Uint8Array(4096);
  private controlBufferLength = 0;

  // Binary transfer state
  private transferActive = false;
  private transferIsV2 = false;
  private transferHeaderReceived = false;
  private transferAckSent = false;
  private transferRequestedWindowId: string | null = null;
  private transferWindowId: string | null = null;
  private transferPpgLen = 0;
  private transferAccelLen = 0;
  private transferTotalLen = 0;
  private transferChunkSize: number = 20;
  private transferStallTimeoutMs: number = Config.DOWNLOAD_STALL_BASE_MS;
  private transferBuffer: Uint8Array = new Uint8Array(0);
  private transferOffset = 0;
  private transferHeaderTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private transferStallTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private transferEndTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Status polling
  private statusPollIntervalId: ReturnType<typeof setInterval> | null = null;
  private statusPollTicks = 0;

  // Connection timeout
  private connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Reconnection state
  private userInitiatedDisconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastConnectedDeviceId: string | null = null;

  // Write serialization — ensures only one writeToBle runs at a time
  private writeQueue: Promise<void> = Promise.resolve();
  // Default framing mode; falls back to raw JSON if watch REPL reports X() missing
  private useX10Framing = true;
  private didAutoFallbackToRawJson = false;

  // Auto-sync state
  private autoSyncEnabled = true;
  private autoSyncInProgress = false;
  private autoSyncQueue: string[] = [];
  private autoSyncTotalWindows = 0;
  private autoSyncCompletedWindows = 0;
  private pendingAutoSyncStart = false;

  // On-device risk prediction
  private riskPredictor = new RiskPredictor();

  // AppState (iOS background handling)
  private appStateSubscription: { remove: () => void } | null = null;
  private appIsActive = true;
  private transferPausedInBackground = false;

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
      try {
        LocalStore.initialize();
      } catch (err) {
        console.warn("[BLE] Failed to initialize local store:", err);
      }
      // Listen for iOS background/foreground transitions
      this.appStateSubscription = AppState.addEventListener(
        "change",
        (nextState: AppStateStatus) => this.handleAppStateChange(nextState),
      );
      this.log("Initialized");
    } catch (e) {
      console.warn("[BLE] Failed to initialize BleManager:", e);
      this.manager = null;
    }
  }

  destroy(): void {
    this.stopReconnecting();
    this.stopStatusPolling();
    this.clearConnectionTimeout();
    this.cancelTransfer();
    this.notificationSubscription?.remove();
    this.disconnectSubscription?.remove();
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
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
    this.stopReconnecting();
    if (this.state.isScanning) return;

    this.state.isScanning = true;
    this.state.discoveredDevices = [];
    this.emit({ type: "connectionStateChanged", state: "scanning" });
    this.log("Scanning...");

    this.manager.startDeviceScan(
      [NUS_SERVICE_UUID],
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
      this.state.discoveredDevices = this.state.discoveredDevices.map((d, i) =>
        i === idx ? bleDevice : d,
      );
    } else {
      this.state.discoveredDevices = [...this.state.discoveredDevices, bleDevice];
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
    if (this.state.connectionState === "connecting") return;

    this.stopReconnecting();
    this.userInitiatedDisconnect = false;
    this.state.lastError = null;

    const device = this.state.discoveredDevices.find((d) => d.id === deviceId);
    const deviceName = device?.name || "Unknown";

    // Set connecting state BEFORE stopping scan to prevent the scan-stop
    // from briefly resetting connectionState to "disconnected" and
    // re-triggering auto-connect.
    this.state.connectionState = "connecting";
    this.state.connectedDeviceId = deviceId;
    this.state.connectedDeviceName = deviceName;
    this.stopScanning();
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
      this.lastConnectedDeviceId = deviceId;
      this.state.connectionState = "connected";
      this.emit({
        type: "connectionStateChanged",
        state: "connected",
        deviceName,
      });
      this.log(`Connected to ${deviceName}`);

      // Best-effort: advertise negotiated MTU payload to firmware (ignored by legacy firmware).
      this.sendSetMtu();

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
    this.userInitiatedDisconnect = true;
    this.stopReconnecting();
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
    const deviceId = this.lastConnectedDeviceId;
    const wasUserInitiated = this.userInitiatedDisconnect;
    this.cleanupConnection();
    this.state.connectionState = "disconnected";
    this.emit({ type: "connectionStateChanged", state: "disconnected" });

    // Attempt automatic reconnection for unexpected disconnects
    if (!wasUserInitiated && deviceId && this.isBluetoothReady()) {
      this.startReconnecting(deviceId);
    }
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
    this.transferPausedInBackground = false;
    this.autoSyncInProgress = false;
    this.autoSyncQueue = [];
    this.autoSyncTotalWindows = 0;
    this.autoSyncCompletedWindows = 0;
    this.pendingAutoSyncStart = false;
    this.state.isAutoSyncing = false;
    this.notificationSubscription?.remove();
    this.notificationSubscription = null;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    this.connectedDevice = null;
    this.txCharacteristic = null;
    this.rxCharacteristic = null;
    this.controlBufferLength = 0;
    this.negotiatedMtu = 23;
    this.useX10Framing = true;
    this.didAutoFallbackToRawJson = false;
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

  private sendSetMtu(): void {
    const mtu = this.negotiatedMtu || 23;
    const payload = Math.max(20, mtu - 3);
    this.log(`Sending set_mtu: mtu=${mtu}, payload=${payload}`);
    this.sendCommand({ type: "set_mtu", mtu, payload });
  }

  sendCommand(command: FourSightCommand): void {
    if (!this.connectedDevice) {
      this.log(`sendCommand(${command.type}): no connected device, bailing`);
      return;
    }
    if (!this.rxCharacteristic) {
      this.log(`sendCommand(${command.type}): no RX characteristic, bailing`);
      return;
    }

    const json = JSON.stringify(command);
    const frame = this.useX10Framing ? `\x10X(${json})\n` : `${json}\n`;
    this.log(
      `sendCommand(${command.type}): enqueueing ${frame.length} bytes (framing=${
        this.useX10Framing ? "x10" : "raw"
      })`,
    );
    // Enqueue to serialize writes — prevents overlapping BLE sends
    this.enqueueWrite(frame);
  }

  private enqueueWrite(data: string): void {
    this.writeQueue = this.writeQueue.then(() => this.writeToBle(data));
  }

  private async writeToBle(data: string): Promise<void> {
    const characteristic = this.rxCharacteristic;
    if (!characteristic) {
      this.log("writeToBle: no RX characteristic, skipping");
      return;
    }

    try {
      // Convert string to bytes so control chars (like \x10) survive base64 round-trip
      const bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);

      // Chunk to fit within MTU
      const mtuPayload = Math.max(20, (this.negotiatedMtu || 23) - 3);
      const totalChunks = Math.ceil(bytes.length / mtuPayload);
      this.log(
        `writeToBle: ${bytes.length} bytes, mtuPayload=${mtuPayload}, chunks=${totalChunks}`,
      );

      for (let i = 0; i < bytes.length; i += mtuPayload) {
        const chunk = bytes.subarray(i, Math.min(i + mtuPayload, bytes.length));
        const b64 = this.uint8ToBase64(chunk);
        await this.writeWithTimeout(characteristic, b64);
        if (i + mtuPayload < bytes.length) {
          await new Promise((r) => setTimeout(r, 5));
        }
      }
      this.log("writeToBle: write complete");
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
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("BLE write timeout")), timeoutMs);
    });
    try {
      await Promise.race([characteristic.writeWithoutResponse(data), timeout]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  // ============================================================================
  // INCOMING DATA
  // ============================================================================

  private handleIncomingData(base64Data: string): void {
    const raw = atob(base64Data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    this.log(`RX ${bytes.length} bytes: ${raw.substring(0, 120)}`);

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
    let filteredLen = 0;
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      if (b === XON || b === XOFF) continue;
      filteredLen++;
    }
    if (filteredLen === 0) return;

    if (this.controlBufferLength + filteredLen > this.controlBuffer.length) {
      const newSize = Math.max(
        this.controlBuffer.length * 2,
        this.controlBufferLength + filteredLen + 1024,
      );
      const newBuf = new Uint8Array(newSize);
      newBuf.set(this.controlBuffer.subarray(0, this.controlBufferLength));
      this.controlBuffer = newBuf;
    }
    let w = this.controlBufferLength;
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      if (b === XON || b === XOFF) continue;
      this.controlBuffer[w++] = b;
    }
    this.controlBufferLength = w;
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

      if (line.length === 0) continue;
      if (line.startsWith("{")) {
        this.handleJsonLine(line);
      } else {
        this.handleNonJsonLine(line);
      }
    }
  }

  private handleNonJsonLine(line: string): void {
    if (this.useX10Framing && X_NOT_DEFINED_REGEX.test(line)) {
      this.useX10Framing = false;
      this.log(
        "Detected REPL X() ReferenceError; switching to raw JSON framing and retrying get_status",
      );
      if (!this.didAutoFallbackToRawJson) {
        this.didAutoFallbackToRawJson = true;
        setTimeout(() => this.requestStatus(), 0);
      }
      return;
    }

    this.log(`processControlBuffer: non-JSON line: ${line.substring(0, 100)}`);
  }

  private handleJsonLine(line: string): void {
    // Handle concatenated JSON objects using brace-depth tracking
    if (!line.includes("}{")) {
      this.parseAndHandle(line);
      return;
    }
    let depth = 0;
    let start = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "{") depth++;
      else if (line[i] === "}") {
        depth--;
        if (depth === 0) {
          this.parseAndHandle(line.substring(start, i + 1));
          start = i + 1;
        }
      }
    }
  }

  private parseAndHandle(jsonStr: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(jsonStr);
    } catch (e) {
      this.log(`parseAndHandle: invalid JSON: ${jsonStr.substring(0, 100)}`);
      return;
    }
    if (!msg || typeof msg.type !== "string") {
      this.log(`parseAndHandle: no 'type' field: ${jsonStr.substring(0, 100)}`);
      return;
    }
    this.log(`parseAndHandle: type=${msg.type}`);

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
      case "transfer_progress":
        this.handleTransferProgress(msg);
        break;
      case "ping":
        this.handleTransferPing(msg);
        break;
      case "end":
        this.handleTransferEnd(msg);
        break;
      case "ack":
        this.handleAck(msg);
        break;
      case "error":
        this.handleDeviceError(msg);
        break;
      case "sync_ready":
        this.handleSyncReady(msg);
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
    this.log(`handleAck: cmd=${cmd}`);
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

  private handleTransferProgress(msg: Record<string, unknown>): void {
    if (!this.state.isDownloading) return;
    const windowId = String(msg.windowId ?? this.transferWindowId ?? "");
    const bytesSent =
      typeof msg.bytesSent === "number" ? msg.bytesSent : undefined;
    const totalBytes =
      typeof msg.totalBytes === "number" ? msg.totalBytes : undefined;
    this.log(
      `transfer_progress: windowId=${windowId}, bytesSent=${bytesSent ?? "?"}, total=${totalBytes ?? "?"}`,
    );
  }

  private handleTransferPing(msg: Record<string, unknown>): void {
    if (!this.state.isDownloading) return;
    const windowId = String(msg.windowId ?? this.transferWindowId ?? "");
    this.log(`transfer_ping: windowId=${windowId}`);
  }

  private handleDeviceError(msg: Record<string, unknown>): void {
    const cmd = typeof msg.cmd === "string" ? msg.cmd : "unknown";
    const message = typeof msg.message === "string" ? msg.message : "unknown";

    if (
      OPTIONAL_V2_COMMANDS.has(cmd) &&
      (message === "unknown_command" || message === "missing_type")
    ) {
      this.log(`Ignoring optional v2 command error: cmd=${cmd}, message=${message}`);
      return;
    }

    // Benign: start_recording when already recording, or stop when not
    if (
      (cmd === "start_recording" && message === "already_recording") ||
      (cmd === "stop_recording" && message === "not_recording")
    ) {
      this.log(`Ignoring benign recording error: cmd=${cmd}, message=${message}`);
      return;
    }

    this.log(`Device error: cmd=${cmd}, message=${message}`);

    if (cmd === "get_window_data" && this.state.isDownloading) {
      this.handleTransferFailure(
        "device_error",
        `Device rejected get_window_data: ${message}`,
        true,
      );
      return;
    }

    this.handleError("DEVICE_ERROR", `${cmd}: ${message}`);
  }

  private handleQueueResponse(msg: Record<string, unknown>): void {
    const windows = Array.isArray(msg.windows) ? (msg.windows as string[]) : [];
    const prevLen = this.state.uploadQueue.length;
    this.state.uploadQueue = windows;
    if (windows.length !== prevLen) {
      this.log(`Queue: ${windows.length} windows`);
    }
    this.emit({ type: "queueUpdated", windows });

    // If sync_ready set the flag, now that the queue is populated, start auto-sync
    if (this.pendingAutoSyncStart) {
      this.pendingAutoSyncStart = false;
      if (!this.autoSyncInProgress && !this.state.isDownloading && windows.length > 0) {
        this.startAutoSync();
      }
    }
  }

  // ============================================================================
  // BINARY TRANSFER (window download)
  // ============================================================================

  private handleWindowDataHeader(msg: Record<string, unknown>): void {
    const headerWindowId = String(msg.windowId ?? "");
    const expectedWindowId = this.transferRequestedWindowId ?? headerWindowId;
    if (!this.state.isDownloading) {
      this.log(`Ignoring unexpected transfer header for ${headerWindowId}`);
      return;
    }
    if (expectedWindowId && headerWindowId && expectedWindowId !== headerWindowId) {
      this.handleTransferFailure(
        "header_mismatch",
        `Header windowId mismatch: expected=${expectedWindowId}, actual=${headerWindowId}`,
        true,
      );
      return;
    }

    const ppgLen =
      typeof msg.ppgLen === "number" ? Math.max(0, msg.ppgLen) : 0;
    const accelLen =
      typeof msg.accelLen === "number" ? Math.max(0, msg.accelLen) : 0;
    const totalLength = Math.max(
      0,
      typeof msg.totalLength === "number" ? msg.totalLength : ppgLen + accelLen,
    );
    const protocolVersion =
      typeof msg.protocolVersion === "number" ? msg.protocolVersion : 1;
    const chunkSize =
      typeof msg.chunkSize === "number" && msg.chunkSize > 0
        ? msg.chunkSize
        : Math.max(20, (this.negotiatedMtu || 23) - 3);

    this.clearTransferHeaderTimeout();
    this.transferHeaderReceived = true;
    this.transferIsV2 = protocolVersion >= 2;
    this.transferAckSent = false;
    this.transferWindowId = expectedWindowId || headerWindowId || "";
    this.transferPpgLen = ppgLen;
    this.transferAccelLen = accelLen;
    this.transferTotalLen = totalLength;
    this.transferChunkSize = chunkSize;
    this.transferStallTimeoutMs = this.computeTransferStallTimeoutMs(totalLength);
    this.transferBuffer = new Uint8Array(totalLength);
    this.transferOffset = 0;
    this.transferActive = totalLength > 0;

    this.log(
      `Transfer header: windowId=${this.transferWindowId}, protocol=${protocolVersion}, ppg=${ppgLen}, accel=${accelLen}, total=${totalLength}, chunkSize=${this.transferChunkSize}`,
    );

    if (totalLength > 0) {
      this.resetTransferStallTimeout();
    } else {
      this.startTransferEndTimeout();
    }

    if (this.transferIsV2 && this.transferWindowId) {
      this.sendCommand({ type: "next_chunk", windowId: this.transferWindowId });
    }
  }

  private handleTransferData(data: Uint8Array): void {
    if (!this.transferActive) return;
    const remaining = this.transferTotalLen - this.transferOffset;
    const bytesToCopy = Math.min(data.length, remaining);
    if (bytesToCopy > 0) {
      this.transferBuffer.set(data.subarray(0, bytesToCopy), this.transferOffset);
      this.transferOffset += bytesToCopy;
      this.resetTransferStallTimeout();
    }

    // Emit progress
    if (this.transferTotalLen > 0) {
      const windowPct = (this.transferOffset / this.transferTotalLen) * 100;
      // During auto-sync, show overall progress across all windows
      const pct = this.autoSyncInProgress && this.autoSyncTotalWindows > 0
        ? Math.round(
            ((this.autoSyncCompletedWindows + windowPct / 100) /
              this.autoSyncTotalWindows) *
              100,
          )
        : Math.round(windowPct);
      this.state.downloadProgress = pct;
      this.emit({
        type: "downloadProgress",
        windowId: this.transferWindowId!,
        bytesReceived: this.transferOffset,
        totalBytes: this.transferTotalLen,
        percentage: pct,
      });
    }

    const hasLeftoverControl = data.length > bytesToCopy;
    if (hasLeftoverControl) {
      const leftover = data.subarray(bytesToCopy);
      this.transferActive = false;
      this.appendToControlBuffer(leftover);
      this.processControlBuffer();
    }

    // Control processing may have already completed/cancelled this transfer.
    if (!this.transferHeaderReceived) return;

    // All bytes received — now wait for explicit end marker.
    if (this.transferOffset >= this.transferTotalLen) {
      this.transferActive = false;
      this.clearTransferStallTimeout();
      this.sendBinaryAckIfNeeded();
      this.startTransferEndTimeout();
    }
  }

  private handleTransferEnd(msg: Record<string, unknown>): void {
    const windowId = String(
      msg.windowId ??
        this.transferWindowId ??
        this.transferRequestedWindowId ??
        "",
    );

    this.clearTransferHeaderTimeout();
    this.clearTransferStallTimeout();
    this.clearTransferEndTimeout();

    if (this.transferTotalLen > 0 && this.transferOffset < this.transferTotalLen) {
      this.handleTransferFailure(
        "end_before_complete",
        `Received end before full payload (${this.transferOffset}/${this.transferTotalLen})`,
        false,
      );
      return;
    }

    this.finishTransferSuccess(windowId);
  }

  private finishTransferSuccess(windowId: string): void {
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
    this.endTransferSession();
    this.state.isDownloading = false;
    if (!this.autoSyncInProgress) this.state.downloadProgress = 0;
    this.emit({ type: "downloadComplete", result });
    this.startStatusPolling();

    if (this.autoSyncInProgress) {
      this.handleAutoSyncWindowComplete(result);
    }
  }

  private sendBinaryAckIfNeeded(): void {
    if (!this.transferIsV2 || this.transferAckSent || !this.transferWindowId) return;
    this.transferAckSent = true;
    this.sendCommand({
      type: "binary_ack",
      windowId: this.transferWindowId,
      bytesReceived: this.transferOffset,
    });
    this.log(
      `Sent binary_ack: windowId=${this.transferWindowId}, bytesReceived=${this.transferOffset}`,
    );
  }

  private computeTransferStallTimeoutMs(expectedBytes: number): number {
    const dynamic =
      Config.DOWNLOAD_STALL_BASE_MS +
      Math.ceil(Math.max(0, expectedBytes) / 200) *
        Config.DOWNLOAD_STALL_PER_200_BYTES_MS;
    return Math.min(Config.DOWNLOAD_STALL_MAX_MS, dynamic);
  }

  private startTransferHeaderTimeout(windowId: string): void {
    this.clearTransferHeaderTimeout();
    this.transferHeaderTimeoutId = setTimeout(() => {
      if (!this.state.isDownloading || this.transferHeaderReceived) return;
      this.handleTransferFailure(
        "header_timeout",
        `Timed out waiting for window_data header (${windowId})`,
        true,
      );
    }, Config.DOWNLOAD_HEADER_TIMEOUT_MS);
  }

  private clearTransferHeaderTimeout(): void {
    if (!this.transferHeaderTimeoutId) return;
    clearTimeout(this.transferHeaderTimeoutId);
    this.transferHeaderTimeoutId = null;
  }

  private resetTransferStallTimeout(): void {
    if (!this.state.isDownloading || this.transferTotalLen <= 0) return;
    this.clearTransferStallTimeout();
    this.transferStallTimeoutId = setTimeout(() => {
      if (!this.state.isDownloading || !this.transferHeaderReceived) return;
      this.handleTransferFailure(
        "stall_timeout",
        `Transfer stalled at ${this.transferOffset}/${this.transferTotalLen}`,
        true,
      );
    }, this.transferStallTimeoutMs);
  }

  private clearTransferStallTimeout(): void {
    if (!this.transferStallTimeoutId) return;
    clearTimeout(this.transferStallTimeoutId);
    this.transferStallTimeoutId = null;
  }

  private startTransferEndTimeout(): void {
    if (!this.state.isDownloading) return;
    this.clearTransferEndTimeout();
    this.transferEndTimeoutId = setTimeout(() => {
      if (!this.state.isDownloading || !this.transferHeaderReceived) return;
      this.handleTransferFailure(
        "end_timeout",
        `Timed out waiting for end marker (${this.transferOffset}/${this.transferTotalLen})`,
        true,
      );
    }, Config.DOWNLOAD_END_MARKER_TIMEOUT_MS);
  }

  private clearTransferEndTimeout(): void {
    if (!this.transferEndTimeoutId) return;
    clearTimeout(this.transferEndTimeoutId);
    this.transferEndTimeoutId = null;
  }

  private handleTransferFailure(
    reason: string,
    message: string,
    sendCancelTransfer: boolean,
  ): void {
    if (!this.state.isDownloading) return;
    const windowId = this.transferWindowId ?? this.transferRequestedWindowId ?? "";
    const bytesReceived = this.transferOffset;
    const totalBytes = this.transferTotalLen;
    const ratio = totalBytes > 0 ? bytesReceived / totalBytes : 0;

    this.log(`Transfer failed: reason=${reason}, ${message}`);

    if (sendCancelTransfer && this.connectedDevice && this.rxCharacteristic) {
      this.sendCommand({ type: "cancel_transfer" });
    }

    if (totalBytes > 0 && ratio >= Config.DOWNLOAD_PARTIAL_RATIO_THRESHOLD) {
      const ppgBytes = Math.min(this.transferPpgLen, bytesReceived);
      const accelStart = this.transferPpgLen;
      const accelEnd = Math.min(this.transferPpgLen + this.transferAccelLen, bytesReceived);
      const result: PartialTransferResult = {
        windowId,
        bytesReceived,
        totalBytes,
        ppgData: this.transferBuffer.slice(0, ppgBytes),
        accelData:
          accelEnd > accelStart
            ? this.transferBuffer.slice(accelStart, accelEnd)
            : new Uint8Array(0),
        reason,
      };
      this.endTransferSession();
      this.state.isDownloading = false;
      if (!this.autoSyncInProgress) this.state.downloadProgress = 0;
      this.emit({ type: "downloadPartial", result });
      this.startStatusPolling();
      if (this.autoSyncInProgress) {
        this.autoSyncCompletedWindows++;
        this.log(`autoSync: partial download for ${windowId}, skipping to next`);
        setTimeout(() => this.downloadNextInAutoSync(), Config.AUTO_SYNC_RETRY_DELAY_MS);
      }
      return;
    }

    this.endTransferSession();
    this.state.isDownloading = false;
    if (!this.autoSyncInProgress) this.state.downloadProgress = 0;
    this.handleError("DOWNLOAD_FAILED", message);
    this.startStatusPolling();
    if (this.autoSyncInProgress) {
      this.autoSyncCompletedWindows++;
      this.log(`autoSync: download failed for ${windowId}, skipping to next`);
      setTimeout(() => this.downloadNextInAutoSync(), Config.AUTO_SYNC_RETRY_DELAY_MS);
    }
  }

  private endTransferSession(): void {
    this.clearTransferHeaderTimeout();
    this.clearTransferStallTimeout();
    this.clearTransferEndTimeout();
    this.transferActive = false;
    this.transferIsV2 = false;
    this.transferHeaderReceived = false;
    this.transferAckSent = false;
    this.transferRequestedWindowId = null;
    this.transferWindowId = null;
    this.transferPpgLen = 0;
    this.transferAccelLen = 0;
    this.transferTotalLen = 0;
    this.transferChunkSize = 20;
    this.transferStallTimeoutMs = Config.DOWNLOAD_STALL_BASE_MS;
    this.transferBuffer = new Uint8Array(0);
    this.transferOffset = 0;
  }

  private cancelTransfer(): void {
    this.endTransferSession();
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
    this.log("startRecording() called");
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
    this.cancelTransfer();
    this.transferRequestedWindowId = windowId;
    this.transferHeaderReceived = false;
    this.state.isDownloading = true;
    this.state.downloadProgress = 0;
    this.stopStatusPolling();
    this.startTransferHeaderTimeout(windowId);
    this.log(`Requesting window data: ${windowId}`);
    // Best-effort: clear stale firmware state before starting new download.
    this.sendCommand({ type: "cancel_transfer" });
    this.sendCommand({ type: "get_window_data", windowId });
  }

  confirmUpload(windowId: string): void {
    this.sendCommand({ type: "confirm_upload", windowId });
  }

  deleteAllWindows(): void {
    this.sendCommand({ type: "delete_all_windows" });
  }

  // ============================================================================
  // AUTO-SYNC
  // ============================================================================

  private handleSyncReady(msg: Record<string, unknown>): void {
    const queueLen = typeof msg.queueLen === "number" ? msg.queueLen : 0;
    this.log(`sync_ready: queueLen=${queueLen}`);

    if (!this.autoSyncEnabled || queueLen === 0) return;
    if (this.autoSyncInProgress || this.state.isDownloading) return;

    // Set flag so startAutoSync fires once the queue response arrives
    this.pendingAutoSyncStart = true;
    this.requestQueue();
  }

  private startAutoSync(): void {
    if (this.autoSyncInProgress) return;

    const queue = [...this.state.uploadQueue];
    if (queue.length === 0) return;

    const toDownload: string[] = [];
    for (const windowId of queue) {
      if (!LocalStore.hasWindow(windowId)) {
        toDownload.push(windowId);
      } else {
        this.confirmUpload(windowId);
      }
    }

    if (toDownload.length === 0) {
      this.log("autoSync: all windows already stored locally");
      return;
    }

    this.autoSyncInProgress = true;
    this.autoSyncQueue = toDownload;
    this.autoSyncTotalWindows = toDownload.length;
    this.autoSyncCompletedWindows = 0;
    this.state.isAutoSyncing = true;
    this.state.downloadProgress = 0;
    this.log(`autoSync: starting, ${toDownload.length} windows to download`);
    this.emit({ type: "autoSyncStarted", windowCount: toDownload.length });

    this.downloadNextInAutoSync();
  }

  private downloadNextInAutoSync(): void {
    if (this.autoSyncQueue.length === 0) {
      this.autoSyncInProgress = false;
      this.autoSyncTotalWindows = 0;
      this.autoSyncCompletedWindows = 0;
      this.state.isAutoSyncing = false;
      this.state.downloadProgress = 0;
      this.log("autoSync: complete");
      this.emit({ type: "autoSyncComplete" });
      this.requestQueue();
      return;
    }

    const windowId = this.autoSyncQueue.shift()!;
    this.log(`autoSync: downloading ${windowId}`);
    this.downloadWindow(windowId);
  }

  private handleAutoSyncWindowComplete(result: TransferResult): void {
    this.autoSyncCompletedWindows++;
    try {
      const features = extract(
        result.ppgData,
        result.accelData,
        result.windowId,
        parseInt(result.windowId, 10) || Date.now(),
      );

      LocalStore.saveWindow(
        result.windowId,
        result.ppgData,
        result.accelData,
        features,
      );

      // Log key input features for debugging
      if (features) {
        this.log(
          `features[${result.windowId}]: HR=${features.hrMean?.toFixed(1)} sdnn=${features.sdnn?.toFixed(1)} ` +
          `rmssd=${features.rmssd?.toFixed(1)} quality=${features.qualityScore?.toFixed(2)} ` +
          `peaks=${features.peakCount} validRR=${features.validRRCount} ` +
          `accelEnergy=${features.accelEnergy?.toFixed(2)} movement=${features.movementIntensity?.toFixed(3)}`
        );
      }

      // Run on-device risk prediction before upload so we can include it
      let prediction: PredictionResult | null = null;
      if (features) {
        prediction = this.riskPredictor.pushAndPredict(features);
        this.emit({ type: "riskPrediction", result: prediction });
        const p = prediction.prediction;
        const r = p.riskAssessment;
        const dimStr = (label: string, d: { level: number; label: string; confidence: number; probabilities: number[] }) =>
          `${label}=${d.label}(L${d.level},c=${d.confidence.toFixed(2)},p=[${d.probabilities.map(v => v.toFixed(3)).join(',')}])`;
        this.log(
          `risk[${prediction.windowCount}]: ${p.alertLevel} | susceptibility=${p.overallSusceptibility.toFixed(3)} | ` +
          `${dimStr('stress', r.stress)} ${dimStr('health', r.health)} ` +
          `${dimStr('sleep', r.sleepFatigue)} ${dimStr('cog', r.cognitiveFatigue)} ` +
          `${dimStr('exert', r.physicalExertion)} | ` +
          `timeToRisk=${p.timeToRiskMinutes.toFixed(1)}m [${p.timeToRiskRange.lower.toFixed(1)}-${p.timeToRiskRange.upper.toFixed(1)}] | ` +
          `confidence: avg=${p.modelConfidence.average.toFixed(3)} min=${p.modelConfidence.min.toFixed(3)}`
        );
        const c = prediction.cumulative;
        const cr = c.riskAssessment;
        this.log(
          `risk cumulative: ${c.alertLevel} | susceptibility=${c.overallSusceptibility.toFixed(3)} | ` +
          `stress=[${cr.stress.probabilities.map(v => v.toFixed(3)).join(',')}] ` +
          `health=[${cr.health.probabilities.map(v => v.toFixed(3)).join(',')}] ` +
          `sleep=[${cr.sleepFatigue.probabilities.map(v => v.toFixed(3)).join(',')}] ` +
          `cog=[${cr.cognitiveFatigue.probabilities.map(v => v.toFixed(3)).join(',')}] ` +
          `exert=[${cr.physicalExertion.probabilities.map(v => v.toFixed(3)).join(',')}]`
        );
      }

      this.confirmUpload(result.windowId);

      // Upload to D1 as fire-and-forget, only mark confirmed on success
      if (features) {
        uploadBiometrics(features, prediction?.prediction)
          .then(() => {
            LocalStore.markUploadConfirmed(result.windowId);
            this.log(`autoSync: cloud upload confirmed ${result.windowId}`);
          })
          .catch((err) => {
            this.log(`autoSync: cloud upload failed for ${result.windowId}: ${err}`);
          });
      } else {
        LocalStore.markUploadConfirmed(result.windowId);
      }

      this.log(`autoSync: persisted ${result.windowId}, features=${features !== null}`);
    } catch (err) {
      this.log(`autoSync: persist failed for ${result.windowId}: ${err}`);
    }

    setTimeout(
      () => this.downloadNextInAutoSync(),
      Config.AUTO_SYNC_INTER_WINDOW_DELAY_MS,
    );
  }

  setAutoSync(enabled: boolean): void {
    this.autoSyncEnabled = enabled;
    this.log(`autoSync ${enabled ? "enabled" : "disabled"}`);
  }

  // ============================================================================
  // APP STATE (iOS BACKGROUND)
  // ============================================================================

  private handleAppStateChange(nextState: AppStateStatus): void {
    const wasActive = this.appIsActive;
    this.appIsActive = nextState === "active";

    if (wasActive && !this.appIsActive) {
      this.handleEnteredBackground();
    } else if (!wasActive && this.appIsActive) {
      this.handleEnteredForeground();
    }
  }

  private handleEnteredBackground(): void {
    this.log("App entered background");

    // Stop status polling — setInterval timers are unreliable in background
    this.stopStatusPolling();

    // Pause transfer timeouts so they don't fire stale on resume.
    // BLE notifications still flow in background (UIBackgroundModes: bluetooth-central),
    // so handleTransferData() continues to accumulate bytes.
    if (this.state.isDownloading) {
      this.clearTransferStallTimeout();
      this.clearTransferEndTimeout();
      this.clearTransferHeaderTimeout();
      this.transferPausedInBackground = true;
      this.log("Paused transfer timeouts for background");
    }
  }

  private handleEnteredForeground(): void {
    this.log("App entered foreground");

    if (this.state.connectionState !== "connected") return;

    // Resume status polling
    this.startStatusPolling();
    this.requestStatus();
    this.requestQueue();

    // Resume transfer timeouts
    if (this.transferPausedInBackground && this.state.isDownloading) {
      this.transferPausedInBackground = false;

      if (this.transferHeaderReceived && this.transferOffset >= this.transferTotalLen) {
        // Transfer completed while backgrounded — kick the end sequence
        this.log("Transfer completed in background, finishing");
        this.sendBinaryAckIfNeeded();
        this.startTransferEndTimeout();
      } else if (this.transferHeaderReceived) {
        // Transfer still in progress — restart stall timeout
        this.log(
          `Resuming transfer: ${this.transferOffset}/${this.transferTotalLen} bytes`,
        );
        this.resetTransferStallTimeout();
      } else {
        // Still waiting for header
        this.startTransferHeaderTimeout(this.transferRequestedWindowId ?? "");
      }
    } else {
      this.transferPausedInBackground = false;

      if (this.autoSyncInProgress && !this.state.isDownloading) {
        // Auto-sync stalled in background (setTimeout didn't fire) — resume it
        this.log("Foreground resume: resuming stalled auto-sync");
        setTimeout(() => this.downloadNextInAutoSync(), 500);
      } else if (!this.state.isDownloading && this.autoSyncEnabled) {
        // If not downloading and auto-sync is enabled, check for queued windows
        setTimeout(() => {
          if (
            !this.autoSyncInProgress &&
            !this.state.isDownloading &&
            this.state.uploadQueue.length > 0
          ) {
            this.log("Foreground resume: triggering auto-sync check");
            this.startAutoSync();
          }
        }, 1_000);
      }
    }
  }

  // ============================================================================
  // RECONNECTION
  // ============================================================================

  private startReconnecting(deviceId: string): void {
    this.reconnectAttempts = 0;
    this.log(`Starting auto-reconnect to ${deviceId}`);
    this.scheduleReconnectAttempt(deviceId);
  }

  private scheduleReconnectAttempt(deviceId: string): void {
    if (this.reconnectAttempts >= Config.RECONNECT_MAX_ATTEMPTS) {
      this.log(`Auto-reconnect gave up after ${this.reconnectAttempts} attempts`);
      this.reconnectAttempts = 0;
      return;
    }

    const delay = Math.min(
      Config.RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      Config.RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectAttempts++;
    this.log(`Auto-reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimeoutId = setTimeout(async () => {
      this.reconnectTimeoutId = null;
      if (
        this.state.connectionState !== "disconnected" ||
        !this.isBluetoothReady() ||
        !this.manager
      ) {
        return;
      }

      try {
        // Add as a discovered device so connect() can proceed
        if (!this.state.discoveredDevices.some((d) => d.id === deviceId)) {
          this.state.discoveredDevices.push({
            id: deviceId,
            name: "Bangle.js",
            rssi: -100,
          });
        }
        await this.connect(deviceId);
        this.log("Auto-reconnect succeeded");
        this.reconnectAttempts = 0;
      } catch {
        this.log(`Auto-reconnect attempt ${this.reconnectAttempts} failed`);
        this.scheduleReconnectAttempt(deviceId);
      }
    }, delay);
  }

  stopReconnecting(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    this.reconnectAttempts = 0;
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
