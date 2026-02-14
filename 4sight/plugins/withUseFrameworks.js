const { withPodfile } = require('@expo/config-plugins');

module.exports = function withUseFrameworks(config) {
  return withPodfile(config, (config) => {
    if (!config.modResults.contents.includes('use_frameworks!')) {
      config.modResults.contents = config.modResults.contents.replace(
        "platform :ios, podfile_properties['ios.deploymentTarget']",
        "platform :ios, podfile_properties['ios.deploymentTarget']\nuse_frameworks!"
      );
    }
    return config;
  });
};
