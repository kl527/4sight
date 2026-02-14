const { withPodfile } = require('@expo/config-plugins');

module.exports = function withUseFrameworks(config) {
  return withPodfile(config, (config) => {
    if (!config.modResults.contents.includes('use_frameworks!')) {
      // Insert use_frameworks! right before the target block
      config.modResults.contents = config.modResults.contents.replace(
        /^(target\s+'.*'\s+do)/m,
        'use_frameworks!\n\n$1'
      );
    }
    return config;
  });
};
