import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const pluginSource = fs.readFileSync(new URL('./build.js', import.meta.url), 'utf8');
const imageHeader = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const documentedSegmentFields = new Set(`fontSize fontName fontWeight fontStyle
  textDecoration textDecorationStyle textDecorationOffset textDecorationThickness
  textDecorationColor textDecorationSkipInk textCase lineHeight letterSpacing fills
  textStyleId fillStyleId listOptions listSpacing indentation paragraphIndent
  paragraphSpacing hyperlink boundVariables textStyleOverrides openTypeFeatures`.split(/\s+/));

function node(type, id, name, extra = {}) {
  return Object.freeze({
    removed: false, visible: true, locked: false, opacity: 1, parent: null,
    type, id, name, ...extra,
  });
}

function runtime(overrides = {}) {
  let html;
  const figma = {
    mixed: Symbol('mixed'),
    showUI: value => { html = value; },
    ui: { postMessage() {} },
    ...overrides,
  };
  const context = vm.createContext({
    figma, console, Uint8Array, Date, Map, Set, Number, Object, Array, JSON,
    String, Promise, setTimeout, clearTimeout,
  });
  vm.runInContext(pluginSource, context);
  return { figma, context, get html() { return html; } };
}

function designRuntime() {
  const counts = { images: 0, mainComponents: 0, vectors: 0 };
  const master = node('COMPONENT', 'master', 'Icon master', { key: 'remote-key' });
  const text = node('TEXT', '3:1', 'Mixed text', {
    characters: 'Sjóður 💰', fontSize: 12, width: 100, height: 20,
    getStyledTextSegments(fields) {
      assert.ok(fields.every(field => documentedSegmentFields.has(field)));
      return [
        { characters: 'Sjóður ', start: 0, end: 7,
          fontName: { family: 'Inter', style: 'Regular' }, fontSize: 12,
          fills: [{ type: 'IMAGE', imageHash: 'abcdef' }] },
        { characters: '💰', start: 7, end: 9,
          fontName: { family: 'Azeret Mono', style: 'Medium' }, fontSize: 14, fills: [] },
      ];
    },
  });
  const vector = node('VECTOR', '4:1', 'Icon', {
    width: 20, height: 20,
    exportAsync: async () => {
      counts.vectors++;
      return Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'));
    },
  });
  const hidden = node('FRAME', '5:1', 'Hidden frame', {
    visible: false, width: 10, height: 10,
    children: [node('VECTOR', '5:2', 'Hidden icon', {
      width: 2, height: 2,
      exportAsync() { throw new Error('Hidden export must never run'); },
    })],
  });
  const instance = node('INSTANCE', '6:1', 'Icon instance', {
    width: 20, height: 20, children: [],
    getMainComponentAsync: async () => { counts.mainComponents++; return master; },
  });
  const frame = node('FRAME', '2:1', 'Event screen', {
    width: 402, height: 874, children: [text, vector, hidden, instance],
    strokes: [{ type: 'IMAGE', imageHash: 'abcdef' }],
    fills: [{ type: 'IMAGE', imageHash: 'abcdef' }],
    exportAsync: async () => imageHeader,
  });
  const page = node('PAGE', '0:1', 'Screens', {
    children: [frame], loadAsync: async () => {}, prototypeStartNode: frame,
  });
  const result = runtime({
    fileKey: undefined, editorType: 'figma', root: { id: '0:0', name: 'Document' },
    currentPage: page, skipInvisibleInstanceChildren: true,
    getLocalPaintStylesAsync: async () => [], getLocalTextStylesAsync: async () => [],
    getLocalEffectStylesAsync: async () => [], getLocalGridStylesAsync: async () => [],
    variables: {
      getLocalVariablesAsync: async () => [], getLocalVariableCollectionsAsync: async () => [],
    },
    getImageByHash: hash => ({
      getBytesAsync: async () => {
        counts.images++; assert.equal(hash, 'abcdef'); return imageHeader;
      },
      getSizeAsync: async () => ({ width: 16, height: 16 }),
    }),
  });
  return { ...result, counts, page };
}

test('native source reads retain hierarchy, hidden nodes, rich text, image slots and identity caveat', async () => {
  const { figma, context, counts } = designRuntime();
  const source = await vm.runInContext('exportSource()', context);
  assert.equal(source.complete, true, JSON.stringify(source.warnings));
  assert.equal(source.file.key, null);
  assert.equal(source.file.verified, false);
  assert.equal(source.file.expectedKey, 'zFMhaTVnbO70o1soPjNmhL');
  assert.equal(source.page.prototypeStartNode.$figma, 'node-reference');
  assert.equal(source.page.prototypeStartNode.id, '2:1');
  assert.equal(source.stats.nodes, 7);
  assert.equal(source.stats.images, 1);
  assert.equal(source.stats.references, 1);
  assert.equal(source.stats.vectors, 1);
  assert.deepEqual(counts, { images: 1, mainComponents: 1, vectors: 1 });
  assert.equal(figma.skipInvisibleInstanceChildren, true);
  assert.equal(source.page.children[0].children[2].children[0].effectiveVisible, false);
  assert.deepEqual(source.requiredAssets.map(asset => asset.path).sort(),
    source.assets.map(asset => asset.path).sort());
  assert.equal(source.failedAssets.length, 0);
  assert.equal(source.resources.fonts.length, 2);
  assert.ok(source.warnings.some(warning => warning.scope === 'identity'));
});

test('mixed sentinels, live node references, cycles and throwing proxy fields are explicit', () => {
  const { context, figma } = runtime();
  context.value = { mixed: figma.mixed, ref: node('FRAME', '1:2', 'Reference') };
  const copied = vm.runInContext('sourceClone(value,sourceContext(),"test","x","value")', context);
  assert.equal(copied.mixed.$figma, 'mixed');
  assert.equal(copied.ref.$figma, 'node-reference');
  assert.equal(copied.ref.id, '1:2');
  const cyclic = { ok: 1 }; cyclic.self = cyclic; context.value = cyclic;
  assert.equal(vm.runInContext('sourceClone(value,sourceContext(),"test","x","value")', context).self.$figma,
    'unserializable');
  context.value = new Proxy({ ok: 1, bad: 2 }, {
    get(target, key) { if (key === 'bad') throw new Error('blocked getter'); return target[key]; },
  });
  const proxy = vm.runInContext('sourceClone(value,sourceContext(),"test","x","value")', context);
  assert.equal(proxy.ok, 1);
  assert.equal(proxy.bad.$figma, 'unreadable');
});

test('binary base64 remains exact across encoder blocks and padding', () => {
  const { context } = runtime();
  for (const length of [0, 1, 2, 3, 12287, 12288, 12289, 50001]) {
    context.bytes = Uint8Array.from(Array.from({ length }, (_, index) => index % 256));
    assert.equal(vm.runInContext('sourceBase64(bytes)', context),
      Buffer.from(context.bytes).toString('base64'));
  }
});

test('wrong file/page and missing or unsupported assets cannot produce complete source', async () => {
  const { figma, context, page } = designRuntime();
  figma.fileKey = 'wrong';
  await assert.rejects(vm.runInContext('exportSource()', context), /Wrong Figma file/);
  figma.fileKey = undefined;
  figma.currentPage = { ...page, name: 'Wrong' };
  await assert.rejects(vm.runInContext('exportSource()', context), /Wrong page/);
  figma.currentPage = page;
  figma.getImageByHash = () => null;
  const missing = await vm.runInContext('exportSource()', context);
  assert.equal(missing.complete, false);
  assert.equal(missing.failedAssets.length, 1);
  assert.equal(missing.failedAssets[0].path, 'images/abcdef.bin');
  assert.ok(missing.requiredAssets.some(asset => asset.imageHash === 'abcdef'));
  figma.getImageByHash = () => ({
    getBytesAsync: async () => Uint8Array.from([1, 2, 3]),
    getSizeAsync: async () => ({ width: 1, height: 1 }),
  });
  const unknown = await vm.runInContext('exportSource()', context);
  assert.equal(unknown.complete, false);
  assert.equal(unknown.failedAssets.length, 1);
  assert.equal(unknown.assets[0].path, 'images/abcdef.bin');
  assert.equal(figma.skipInvisibleInstanceChildren, true);
});

test('styled segments use documented range keys and a separate text-wrap getter', () => {
  const { context } = runtime();
  let fields;
  context.textNode = {
    id: 'a', type: 'TEXT', characters: 'Hello', fontStyle: 'REGULAR',
    textDecorationStyle: null, textDecorationOffset: null,
    textDecorationThickness: null, textDecorationColor: null,
    textDecorationSkipInk: null, textWrapStyle: 'BALANCED',
    getStyledTextSegments(requested) {
      fields = requested;
      assert.ok(requested.every(field => documentedSegmentFields.has(field)));
      return [{ start: 0, end: 5, characters: 'Hello',
        fontName: { family: 'Inter', style: 'Regular' }, fills: [] }];
    },
    getRangeTextWrapStyle(start, end) {
      assert.equal(start, 0); assert.equal(end, 5); return 'BALANCED';
    },
  };
  const segments = vm.runInContext('sourceTextSegments(textNode,sourceContext())', context);
  assert.equal(segments[0].textWrapStyle, 'BALANCED');
  for (const field of ['paragraphIndent', 'paragraphSpacing', 'listSpacing', 'fontStyle']) {
    assert.ok(fields.includes(field));
  }
  assert.ok(!fields.includes('textWrapStyle'));
});

test('acknowledged download preserves UTF-8 emoji at chunk boundaries and validates interruption', async () => {
  const { figma, context, html } = runtime();
  let blobPayload, closed = false;
  const transport = [], revoked = [], elements = {};
  for (const id of ['apply', 'focus', 'audit', 'done', 'exportSource', 'result', 'exportStatus', 'saveSource']) {
    elements[id] = { disabled: false, hidden: id === 'saveSource', value: '', textContent: '' };
  }
  class CapturingBlob extends Blob {
    constructor(parts, options) { super(parts, options); blobPayload = this; }
  }
  const iframe = vm.createContext({
    document: { getElementById: id => elements[id] },
    parent: { postMessage: ({ pluginMessage }) => { void figma.ui.onmessage(pluginMessage); } },
    Blob: CapturingBlob,
    URL: { createObjectURL: () => 'blob:local-test', revokeObjectURL: url => revoked.push(url) },
    JSON, Number, String, Error,
  });
  vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1], iframe);
  const deliver = message => {
    transport.push(message); iframe.message = message;
    vm.runInContext('onmessage({data:{pluginMessage:message}})', iframe);
  };
  figma.ui.postMessage = deliver;
  figma.closePlugin = () => { closed = true; };
  const chunkLength = vm.runInContext('SOURCE_LIMITS.chunkCharacters', context);
  const value = {
    format: 'hittingar-figma-source', version: 1, exportedAt: '2026-10-07T12:34:56.000Z',
    complete: true, file: { key: null, verified: false }, stats: {}, warnings: [], text: '',
  };
  const prefixLength = JSON.stringify(value).indexOf('"text":"') + '"text":"'.length;
  value.text = 'x'.repeat(chunkLength - prefixLength - 1) + '💰 á Þ ø 🔹 ' + 'z'.repeat(chunkLength);
  context.exportValue = value;
  const expected = JSON.stringify(value);
  await vm.runInContext('sourceDownload(exportValue)', context);
  assert.equal(Buffer.compare(Buffer.from(await blobPayload.arrayBuffer()), Buffer.from(expected, 'utf8')), 0);
  assert.equal(await blobPayload.text(), expected);
  assert.equal(elements.saveSource.hidden, false);
  assert.match(elements.saveSource.download, /hittingar-figma-source-2026/);
  assert.equal(elements.saveSource.href, 'blob:local-test');
  assert.ok(elements.exportStatus.textContent.startsWith('Source ready.'));
  assert.equal(elements.exportSource.disabled, false);
  const chunks = transport.filter(message => message.type === 'source-chunk');
  assert.ok(chunks.length >= 3);
  assert.ok(chunks[0].text.endsWith('💰'));
  assert.equal(chunks.map(chunk => chunk.text).join(''), expected);
  await vm.runInContext('sourceDownload(exportValue)', context);
  assert.equal(revoked.length, 1);
  deliver({ type: 'source-begin', id: 'bad', filename: 'bad.json', length: 8 });
  deliver({ type: 'source-ready', id: 'bad', complete: true, file: {}, stats: {}, warnings: [] });
  assert.equal(elements.saveSource.hidden, true);
  assert.match(elements.exportStatus.textContent, /interrupted/);
  vm.runInContext('exporting=true', context);
  await figma.ui.onmessage({ type: 'close' });
  assert.equal(closed, true);
});
