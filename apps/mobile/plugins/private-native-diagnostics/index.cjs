const fs = require('node:fs');
const path = require('node:path');
const { withAppDelegate, withMainApplication, withAndroidManifest, withDangerousMod, withXcodeProject, createRunOncePlugin, IOSConfig } = require('expo/config-plugins');
const { readBuildConfig } = require('./policy.cjs');

function modifyAndroidApplication(source) {
  if (source.includes('// private-native-diagnostics:start')) return source;
  if (!/super[.]onCreate\(\)/.test(source) || !/PackageList\(this\)[.]packages[.]apply\s*\{/.test(source)) throw new Error('Private diagnostics requires the supported Expo Kotlin application template.');
  return source.replace(/(package[^\n]*\n)/, '$1\nimport \x60is\x60.rummal.diagnostics.PrivateDiagnosticsBootstrap\nimport \x60is\x60.rummal.diagnostics.PrivateDiagnosticsPackage\n')
    .replace(/(super[.]onCreate\(\))/, '$1\n    // private-native-diagnostics:start\n    PrivateDiagnosticsBootstrap.start(this)\n    // private-native-diagnostics:end')
    .replace(/(PackageList\(this\)[.]packages[.]apply\s*\{)/, '$1\n          add(PrivateDiagnosticsPackage())');
}
function modifyAppDelegate(source) {
  if (source.includes('// private-native-diagnostics:start')) return source;
  const launch = /(func application\([\s\S]*?didFinishLaunchingWithOptions[\s\S]*?\)\s*->\s*Bool\s*\{)/;
  if (!launch.test(source)) throw new Error('Private diagnostics requires the supported Expo Swift AppDelegate template.');
  return source.replace(launch, '$1\n    // private-native-diagnostics:start\n    PrivateDiagnosticsBootstrap.start()\n    // private-native-diagnostics:end');
}
function javaConfig(config) {
  return 'package is.rummal.diagnostics;\npublic final class PrivateDiagnosticsConfig {\n' +
    '  public static final boolean ENABLED = ' + config.enabled + ';\n' +
    ['dsn', 'release', 'environment'].map(key => '  public static final String ' + key.toUpperCase() + ' = ' + JSON.stringify(config[key]) + ';\n').join('') + '}\n';
}
function swiftConfig(config) {
  return 'import Foundation\nenum PrivateDiagnosticsConfig {\n' +
    '    static let enabled = ' + config.enabled + '\n' +
    ['dsn', 'release', 'environment'].map(key => '    static let ' + key + ' = ' + JSON.stringify(config[key]) + '\n').join('') + '}\n';
}
function copyTemplates(directory, destination, extension) {
  fs.mkdirSync(destination, { recursive: true });
  for (const filename of fs.readdirSync(directory)) {
    if (filename.endsWith(extension) && fs.statSync(path.join(directory, filename)).isFile()) fs.copyFileSync(path.join(directory, filename), path.join(destination, filename));
  }
}
function plugin(config) {
  const nativeConfig = readBuildConfig();
  config = withAndroidManifest(config, current => {
    current.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const application = current.modResults.manifest.application?.[0];
    if (!application) throw new Error('Missing Android application for private diagnostics.');
    application['meta-data'] = (application['meta-data'] || []).filter(item => item.$['android:name'] !== 'io.sentry.auto-init');
    application['meta-data'].push({ $: { 'android:name': 'io.sentry.auto-init', 'android:value': 'false', 'tools:replace': 'android:value' } });
    application.provider = (application.provider || []).filter(item => !['io.sentry.android.core.SentryInitProvider', 'io.sentry.android.core.SentryPerformanceProvider', 'io.sentry.ndk.SentryNdkPreloadProvider'].includes(item.$['android:name']));
    for (const name of ['io.sentry.android.core.SentryInitProvider', 'io.sentry.android.core.SentryPerformanceProvider', 'io.sentry.ndk.SentryNdkPreloadProvider']) application.provider.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    return current;
  });
  config = withMainApplication(config, current => {
    if (current.modResults.language !== 'kt') throw new Error('Private diagnostics requires Kotlin MainApplication.');
    current.modResults.contents = modifyAndroidApplication(current.modResults.contents);
    return current;
  });
  config = withDangerousMod(config, ['android', current => {
    const destination = path.join(current.modRequest.platformProjectRoot, 'app/src/main/java/is/rummal/diagnostics');
    copyTemplates(path.join(__dirname, 'android'), destination, '.java');
    fs.writeFileSync(path.join(destination, 'PrivateDiagnosticsConfig.java'), javaConfig(nativeConfig));
    return current;
  }]);
  config = withAppDelegate(config, current => {
    if (current.modResults.language !== 'swift') throw new Error('Private diagnostics requires Swift AppDelegate.');
    current.modResults.contents = modifyAppDelegate(current.modResults.contents);
    return current;
  });
  config = withXcodeProject(config, current => {
    const projectName = current.modRequest.projectName || IOSConfig.XcodeUtils.getProjectName(current.modRequest.projectRoot);
    const destination = path.join(current.modRequest.platformProjectRoot, projectName);
    copyTemplates(path.join(__dirname, 'ios'), destination, '.swift');
    copyTemplates(path.join(__dirname, 'ios'), destination, '.m');
    fs.writeFileSync(path.join(destination, 'PrivateDiagnosticsConfig.swift'), swiftConfig(nativeConfig));
    for (const filename of ['PrivateDiagnosticsConfig.swift', 'PrivateDiagnosticsPolicy.swift', 'PrivateDiagnostics.swift', 'PrivateDiagnosticsBridge.m']) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: projectName + '/' + filename, groupName: projectName, project: current.modResults });
    }
    current.modResults.addFramework('libz.tbd');
    return current;
  });
  return config;
}
module.exports = createRunOncePlugin(plugin, 'hittumst-private-native-diagnostics', '1.0.0');
module.exports.modifyAndroidApplication = modifyAndroidApplication;
module.exports.modifyAppDelegate = modifyAppDelegate;
module.exports.javaConfig = javaConfig;
module.exports.swiftConfig = swiftConfig;
