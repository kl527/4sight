import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './Modules.types';

type ModulesModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class ModulesModule extends NativeModule<ModulesModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(ModulesModule, 'ModulesModule');
