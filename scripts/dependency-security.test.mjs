import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import decodeEsm from 'decode-uri-component';

const require = createRequire(import.meta.url);
const queryRequire = createRequire(require.resolve('query-string'));
const decodeCjs = queryRequire('decode-uri-component');
const decoderDirectory = dirname(queryRequire.resolve('decode-uri-component'));

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
