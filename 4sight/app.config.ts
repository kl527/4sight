import type { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    magicWord: process.env.FORESIGHT_MAGIC_WORD ?? "",
  },
});
