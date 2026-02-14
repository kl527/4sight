import { useEffect, useState, useCallback } from 'react';
import ExpoMetaGlasses from '@/modules/modules';
import type { GlassesDevice, RegistrationState, StreamingStatus } from '@/modules/modules';

export function useGlasses() {
  const [registrationState, setRegistrationState] = useState<RegistrationState>('unregistered');
  const [devices, setDevices] = useState<GlassesDevice[]>([]);
  const [streamingStatus, setStreamingStatus] = useState<StreamingStatus>('stopped');
  const [lastCaption, setLastCaption] = useState<string | null>(null);
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);

  useEffect(() => {
    const subs = [
      ExpoMetaGlasses.addListener('onRegistrationStateChanged', (e) => setRegistrationState(e.state)),
      ExpoMetaGlasses.addListener('onDevicesChanged', (e) => setDevices(e.devices)),
      ExpoMetaGlasses.addListener('onStreamingStatusChanged', (e) => setStreamingStatus(e.status)),
      ExpoMetaGlasses.addListener('onCaptionReceived', (e) => setLastCaption(e.caption)),
      ExpoMetaGlasses.addListener('onPreviewFrame', (e) => setPreviewFrame(e.base64)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  const configure = useCallback(() => ExpoMetaGlasses.configure(), []);
  const register = useCallback(() => ExpoMetaGlasses.startRegistration(), []);
  const unregister = useCallback(() => ExpoMetaGlasses.stopRegistration(), []);
  const handleUrl = useCallback((url: string) => ExpoMetaGlasses.handleUrl(url), []);
  const startStream = useCallback(
    (deviceId: string, wsUrl: string) => ExpoMetaGlasses.startStreaming(deviceId, wsUrl),
    []
  );
  const stopStream = useCallback(() => ExpoMetaGlasses.stopStreaming(), []);

  return {
    registrationState,
    devices,
    streamingStatus,
    lastCaption,
    previewFrame,
    configure,
    register,
    unregister,
    handleUrl,
    startStream,
    stopStream,
  };
}
