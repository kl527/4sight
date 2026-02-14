import { NativeModule, requireNativeModule } from 'expo';

import { ModulesModuleEvents } from './Modules.types';

declare class ModulesModule extends NativeModule<ModulesModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ModulesModule>('Modules');
