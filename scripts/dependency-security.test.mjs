import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import decodeEsm from 'decode-uri-component';

const require = createRequire(import.meta.url);
const queryRequire = createRequire(require.resolve('query-string'));
const decodeCjs = queryRequire('decode-uri-component');
const decoderDirectory = dirname(queryRequire.resolve('decode-uri-component'));

test('native project tools resolve patched UUID and still create valid identifiers', () => {
  for (const owner of ['xcode', '@expo/ngrok']) {
    const localRequire=createRequire(require.resolve(owner));
    assert.equal(localRequire('uuid/package.json').version,'11.1.1');
    assert.match(localRequire('uuid').v4(),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
  const project=require('xcode').project('unused.pbxproj');
  project.hash={project:{objects:{}}};
  assert.match(project.generateUuid(),/^[A-F0-9]{24}$/);
});

test('navigation resolves the fixed decoder and the CJS bridge preserves upstream code', () => {
  const metadata = JSON.parse(readFileSync(join(decoderDirectory, 'package.json'), 'utf8'));
  assert.equal(metadata.version, '0.5.0');
  const source = readFileSync(join(decoderDirectory, 'index.js'), 'utf8').replaceAll('\r\n', '\n');
  const bridge = readFileSync(join(decoderDirectory, 'index.cjs'), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(bridge.slice(bridge.indexOf('// Matches')).trim(), `${source.replace('export default function', 'function').trim()}\n\nmodule.exports = decodeUriComponent;`);
});

test('navigation decodes Icelandic, spaces and malformed input consistently', () => {
  for (const input of ['Reykjav%C3%ADk', '%C3%9E%C3%B3r', 'a%20b', '%FF%C3%AD', '%E0%A4', '%', '']) {
    assert.equal(decodeCjs(input), decodeEsm(input));
  }
  assert.deepEqual({ ...queryRequire('query-string').parse('area=Reykjav%C3%ADk&name=J%C3%B3n+%C3%9E%C3%B3r') }, { area: 'Reykjavík', name: 'Jón Þór' });
});

test('malformed percent-encoded links finish within a bounded time', () => {
  const run = spawnSync(process.execPath, ['-e', "const q=require('query-string'); const result=q.parse('value='+('%FF'.repeat(100000))); if(result.value.length!==300000)process.exit(2);"], { cwd: process.cwd(), timeout: 5000, encoding: 'utf8' });
  assert.equal(run.error, undefined, run.error?.message);
  assert.equal(run.status, 0, run.stderr);
});


test('native animation peers resolve one SDK-compatible module across the mobile dependency graph', () => {
  const mobileRequire = createRequire(require.resolve('@rummal/mobile/package.json'));
  const versions = mobileRequire('expo/bundledNativeModules.json');
  const consumers = {
    'react-native-reanimated': ['expo-router'],
    'react-native-worklets': ['expo-modules-core', '@expo/ui', 'react-native-reanimated'],
  };
  for (const [dependency, owners] of Object.entries(consumers)) {
    const metadata = dependency + '/package.json';
    const installedPath = realpathSync(mobileRequire.resolve(metadata));
    assert.equal(mobileRequire(metadata).version, versions[dependency], dependency + ' must match the Expo SDK compatibility set');
    for (const owner of owners) {
      const ownerRequire = createRequire(mobileRequire.resolve(owner + '/package.json'));
      assert.equal(realpathSync(ownerRequire.resolve(metadata)), installedPath, owner + ' must resolve the same native ' + dependency + ' as mobile');
    }
  }
});

test('native voice SDK and app resolve the same compatible WebRTC peer', () => {
  const mobileRequire = createRequire(require.resolve('@rummal/mobile/package.json'));
  const sdkRequire = createRequire(mobileRequire.resolve('@livekit/react-native'));
  const metadata = '@livekit/react-native-webrtc/package.json';
  const expected = realpathSync(mobileRequire.resolve(metadata));
  assert.equal(realpathSync(sdkRequire.resolve(metadata)), expected, 'Two WebRTC builds create incompatible native types');
  // SDK 2.x imports org.webrtc; 144.2 moved those classes into livekit.org.webrtc.
  const sdkDirectory = dirname(sdkRequire.resolve('../../package.json'));
  const sdkVersion = JSON.parse(readFileSync(join(sdkDirectory, 'package.json'), 'utf8')).version;
  if (sdkVersion.startsWith('2.')) assert.equal(mobileRequire(metadata).version, '144.1.2');
});
