export type RegistrationState = 'registered' | 'unregistered' | 'registering' | 'unregistering';
export type StreamingStatus = 'streaming' | 'stopped' | 'starting' | 'error';

export type GlassesDevice = {
  id: string;
  name: string;
  modelName: string;
};

export type ExpoMetaGlassesModuleEvents = {
  onRegistrationStateChanged: (params: { state: RegistrationState }) => void;
  onDevicesChanged: (params: { devices: GlassesDevice[] }) => void;
  onStreamingStatusChanged: (params: { status: StreamingStatus }) => void;
  onCaptionReceived: (params: { caption: string; latencyMs: number }) => void;
  onPreviewFrame: (params: { base64: string }) => void;
};
