import { requireNativeView } from 'expo';
import * as React from 'react';

import { ModulesViewProps } from './Modules.types';

const NativeView: React.ComponentType<ModulesViewProps> =
  requireNativeView('Modules');

export default function ModulesView(props: ModulesViewProps) {
  return <NativeView {...props} />;
}
