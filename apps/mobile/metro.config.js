const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Resolve workspace exports directly. Windows drive aliases and npm junctions
// otherwise give Metro two different absolute paths for the same shared package.
const sharedRoot = path.resolve(__dirname, '../../packages/shared');
const exportsMap = require(path.join(sharedRoot, 'package.json')).exports;
const aliases = Object.fromEntries(Object.entries(exportsMap).map(([name, target]) => [
  name === '.' ? '@rummal/shared' : '@rummal/shared' + name.slice(1),
  path.resolve(sharedRoot, target),
]));
config.resolver.resolveRequest = (context, moduleName, platform) =>
  context.resolveRequest(context, aliases[moduleName] ?? moduleName, platform);
module.exports = config;