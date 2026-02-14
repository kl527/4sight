import { useEffect, useRef, useState, useCallback } from 'react';
import {
  BluetoothManager,
  type BluetoothManagerState,
  type BluetoothManagerEvent,
} from '@/features/bluetooth/bluetooth-manager';

export function useBluetooth() {
  const [state, setState] = useState<BluetoothManagerState>(BluetoothManager.getState());
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      BluetoothManager.initialize();
      initialized.current = true;
    }

    const unsubscribe = BluetoothManager.addEventListener((_event: BluetoothManagerEvent) => {
      const next = BluetoothManager.getState();
      setState((prev) => {
        const keys = Object.keys(next) as (keyof BluetoothManagerState)[];
        for (const key of keys) {
          if (prev[key] !== next[key]) return next;
        }
        return prev;
      });
    });

    // Sync initial state
    setState(BluetoothManager.getState());

    return unsubscribe;
  }, []);

  const startScanning = useCallback(() => BluetoothManager.startScanning(), []);
  const stopScanning = useCallback(() => BluetoothManager.stopScanning(), []);
  const connect = useCallback((deviceId: string) => BluetoothManager.connect(deviceId), []);
  const disconnect = useCallback(() => BluetoothManager.disconnect(), []);
  const startRecording = useCallback(() => BluetoothManager.startRecording(), []);
  const stopRecording = useCallback(() => BluetoothManager.stopRecording(), []);
  const downloadWindow = useCallback((windowId: string) => BluetoothManager.downloadWindow(windowId), []);
  const confirmUpload = useCallback((windowId: string) => BluetoothManager.confirmUpload(windowId), []);
  const deleteAllWindows = useCallback(() => BluetoothManager.deleteAllWindows(), []);
  const requestStatus = useCallback(() => BluetoothManager.requestStatus(), []);
  const requestQueue = useCallback(() => BluetoothManager.requestQueue(), []);
  const setAutoSync = useCallback((enabled: boolean) => BluetoothManager.setAutoSync(enabled), []);
  return {
    ...state,
    startScanning,
    stopScanning,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    downloadWindow,
    confirmUpload,
    deleteAllWindows,
    requestStatus,
    requestQueue,
    setAutoSync,
  };
}
