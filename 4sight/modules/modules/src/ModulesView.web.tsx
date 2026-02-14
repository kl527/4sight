import * as React from 'react';

import { ModulesViewProps } from './Modules.types';

export default function ModulesView(props: ModulesViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
