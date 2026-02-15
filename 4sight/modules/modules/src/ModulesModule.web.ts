const unsupported = () => Promise.reject(new Error('ExpoMetaGlasses is not supported on web'));

export default {
  configure: unsupported,
  startRegistration: unsupported,
  stopRegistration: unsupported,
  handleUrl: unsupported,
  startStreaming: unsupported,
  stopStreaming: unsupported,
  addListener: () => ({ remove: () => {} }),
  removeAllListeners: () => {},
};
