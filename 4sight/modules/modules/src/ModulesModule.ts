import { NativeModule, requireNativeModule } from 'expo';

import { ExpoMetaGlassesModuleEvents } from './Modules.types';

declare class ExpoMetaGlassesModule extends NativeModule<ExpoMetaGlassesModuleEvents> {
  configure(): Promise<void>;
  startRegistration(): Promise<void>;
  stopRegistration(): Promise<void>;
  handleUrl(url: string): Promise<void>;
  startStreaming(deviceId: string, wsUrl: string): Promise<void>;
  stopStreaming(): Promise<void>;
}

export default requireNativeModule<ExpoMetaGlassesModule>('ExpoMetaGlasses');
