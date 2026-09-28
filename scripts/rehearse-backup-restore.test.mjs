import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalDocker, assertDisposableDatabase } from './rehearse-backup-restore.mjs';

test('backup rehearsal refuses hosted Docker daemons', () => {
  assert.doesNotThrow(() => assertLocalDocker('unix:///var/run/docker.sock'));
  assert.doesNotThrow(() => assertLocalDocker('npipe:////./pipe/docker_engine'));
  for (const value of ['tcp://127.0.0.1:2375', 'ssh://user@server', 'https://server', ''])
    assert.throws(() => assertLocalDocker(value));
});
test('cleanup cannot target a source, arbitrary name or path', () => {
  assert.doesNotThrow(() => assertDisposableDatabase('hittumst_restore_' + 'a'.repeat(32)));
  for (const name of [
    'postgres',
    'template1',
    'production',
    'hittumst_restore_',
    'hittumst_restore_/../postgres',
    'hittumst_restore_' + 'x'.repeat(32),
  ])
    assert.throws(() => assertDisposableDatabase(name));
});
