import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EXPECTED_FILE_KEY, extractSource, validateSource } from './extract-source.mjs';

function fixture() {
  return {
    format: 'hittingar-figma-source', version: 1, complete: true,
    file: { key: EXPECTED_FILE_KEY, expectedKey: EXPECTED_FILE_KEY, verified: true, name: 'Hittingar — Events Discovery Redesign' },
    page: { id: '0:1', name: 'Screens', children: [{ id: '9:219', type: 'FRAME', name: 'Hittingar', children: [{ id: '9:220', type: 'TEXT', characters: 'Sjóður' }] }] },
    assets: [{ path: 'references/9-219.png', mimeType: 'image/png', kind: 'reference', nodeId: '9:219', dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8gAAAABJRU5ErkJggg==' }],
    requiredAssets: [{ path: 'references/9-219.png', kind: 'reference', nodeId: '9:219' }],
    failedAssets: [],
    warnings: [],
  };
}

test('requires complete source from the requested page and file', () => {
  const source = fixture();
  assert.equal(validateSource(source).nodes, 2);
  assert.throws(() => validateSource({ ...source, complete: false }), /incomplete/);
  assert.throws(() => validateSource({ ...source, page: { ...source.page, id: '1:1' } }), /requested Figma page/);
  assert.throws(() => validateSource({ ...source, file: { ...source.file, key: 'another-file' } }), /identity does not match/);
  assert.throws(() => validateSource({ ...source, file: { ...source.file, expectedKey: 'another-file' } }), /different Figma file/);
});

test('unavailable native file key requires explicit confirmation of the requested file', () => {
  const source = fixture();
  source.file.key = null;
  source.file.verified = false;
  assert.throws(() => validateSource(source), /Confirm the open file/);
  assert.throws(() => validateSource(source, { confirmedFileKey: 'another-file' }), /Confirm the open file/);
  assert.equal(validateSource(source, { confirmedFileKey: EXPECTED_FILE_KEY }).nodes, 2);
});

test('rejects unsafe, conflicting, or invalid binary asset paths and payloads', () => {
  const source = fixture();
  for (const invalidPath of ['../app.tsx', 'references/../../app.png', 'C:/secrets.png', 'references\\image.png', 'references/a:stream.png', 'images/user.js']) {
    assert.throws(() => validateSource({ ...source, assets: [{ ...source.assets[0], path: invalidPath }] }), /Unsafe asset path/);
  }
  assert.throws(() => validateSource({ ...source, assets: [source.assets[0], { ...source.assets[0], path: 'references/9-219.PNG' }] }), /Unsafe asset path|Duplicate asset path/);
  assert.throws(() => validateSource({ ...source, assets: [{ ...source.assets[0], kind: 'image' }] }), /kind does not match/);
  assert.throws(() => validateSource({ ...source, assets: [{ ...source.assets[0], mimeType: 'image/svg\+xml' }] }), /mismatched asset type/);
  assert.throws(() => validateSource({ ...source, assets: [{ ...source.assets[0], dataBase64: 'invalid!' }] }), /encoding/);
  assert.throws(() => validateSource({ ...source, assets: [{ ...source.assets[0], nodeId: 'missing' }] }), /unknown source node/);
  assert.throws(() => validateSource({ ...source, assets: [] }), /Required asset is missing/);
  assert.throws(() => validateSource({ ...source, assets: [{ ...source.assets[0], dataBase64: Buffer.from('bad PNG data').toString('base64') }] }), /bytes do not match their format/);
});

test('requires all planned assets and refuses failed or mismatched exports', () => {
  const source = fixture();
  assert.throws(() => validateSource({ ...source, failedAssets: [{ path: 'images/missing.png', message: 'missing' }] }), /failed asset reads/);
  assert.throws(() => validateSource({ ...source, requiredAssets: [...source.requiredAssets, { path: 'images/missing.png', kind: 'image' }] }), /Required asset is missing/);
  assert.throws(() => validateSource({ ...source, requiredAssets: [{ ...source.requiredAssets[0], nodeId: 'different' }] }), /Required asset is missing or mismatched/);
  assert.throws(() => validateSource({ ...source, requiredAssets: [] }), /absent from its required asset manifest/);
  assert.throws(() => validateSource({ ...source, assets: [], requiredAssets: [] }), /no screen reference renders/);
});

test('rejects duplicate hierarchy IDs', () => {
  const source = fixture();
  source.page.children[0].children[0].id = '9:219';
  assert.throws(() => validateSource(source), /Duplicate source node/);
});

test('extracts a local source with byte-for-byte assets and refuses an existing output directory', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'hittingar-source-test-'));
  const input = path.join(workspace, 'export.json');
  const output = path.join(workspace, 'source');
  const source = fixture();
  await writeFile(input, JSON.stringify(source));
  const result = await extractSource(input, output);
  assert.equal(result.nodes, 2);
  assert.deepEqual(await readFile(path.join(output, 'references', '9-219.png')), Buffer.from(source.assets[0].dataBase64, 'base64'));
  const saved = JSON.parse(await readFile(path.join(output, 'source.json'), 'utf8'));
  assert.equal(saved.page.children[0].children[0].characters, 'Sjóður');
  assert.equal(saved.assets[0].dataBase64, undefined);
  assert.match(saved.assets[0].sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(extractSource(input, output), /EEXIST/);
});
