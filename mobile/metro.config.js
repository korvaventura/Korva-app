const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') {
    return context.resolveRequest(
      context,
      path.resolve(__dirname, 'node_modules/three/build/three.module.js'),
      platform
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
