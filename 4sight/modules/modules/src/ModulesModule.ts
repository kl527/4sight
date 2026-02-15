import { NativeModule, requireOptionalNativeModule } from 'expo';

import { ExpoMetaGlassesModuleEvents } from './Modules.types';

declare class ExpoMetaGlassesModule extends NativeModule<ExpoMetaGlassesModuleEvents> {
  configure(): Promise<void>;
  startRegistration(): Promise<void>;
  stopRegistration(): Promise<void>;
  handleUrl(url: string): Promise<void>;
  startStreaming(deviceId: string, wsUrl: string): Promise<void>;
  stopStreaming(): Promise<void>;
}

const nativeModule = requireOptionalNativeModule<ExpoMetaGlassesModule>('ExpoMetaGlasses');

const unavailable = () =>
  Promise.reject(
    new Error(
      'ExpoMetaGlasses native module is unavailable. Rebuild your development client after native changes.'
    )
  );

const fallbackModule = {
  configure: unavailable,
  startRegistration: unavailable,
  stopRegistration: unavailable,
  handleUrl: unavailable,
  startStreaming: unavailable,
  stopStreaming: unavailable,
  addListener: () => ({ remove: () => {} }),
  removeAllListeners: () => {},
} as unknown as ExpoMetaGlassesModule;

export default nativeModule ?? fallbackModule;
