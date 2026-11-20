// Expo's default config already understands npm-workspace monorepos.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// three.js: always its ES module build. React Three Fiber's native build
// require()s 'three', which would pick three.cjs, and that file calls Node's
// process.emitWarning (not on phones), so opening the house crashed.
const threeModule = path.join(path.dirname(require.resolve('three')), 'three.module.js');
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: threeModule };
  return resolveRequest ? resolveRequest(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
