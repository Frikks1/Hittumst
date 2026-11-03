import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED_FILE_KEY = 'zFMhaTVnbO70o1soPjNmhL';
const MAX_INPUT_BYTES = 256 * 1024 * 1024;
const MAX_ASSET_BYTES = 192 * 1024 * 1024;
const MIME_EXTENSIONS = new Map([
  ['image/png', new Set(['.png'])],
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/webp', new Set(['.webp'])],
  ['image/gif', new Set(['.gif'])],
  ['image/svg+xml', new Set(['.svg'])],
]);

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateSource(source, { confirmedFileKey } = {}) {
  requireCondition(source?.format === 'hittingar-figma-source' && source.version === 1, 'Unsupported Figma source export.');
  requireCondition(source.complete === true, 'The Figma export is incomplete. Read its warnings before transferring the UI.');
  requireCondition(source.file?.expectedKey === EXPECTED_FILE_KEY, 'The export targets a different Figma file.');
  requireCondition(source.page?.id === '0:1', 'The export must contain the requested Figma page (0:1).');
  if (source.file.key !== null) {
    requireCondition(source.file.key === EXPECTED_FILE_KEY && source.file.verified === true, 'The exported Figma file identity does not match.');
  } else {
    requireCondition(confirmedFileKey === EXPECTED_FILE_KEY, 'Figma could not provide its file key. Confirm the open file before passing --confirm-file-key.');
  }
  requireCondition(Array.isArray(source.page.children) && source.page.children.length > 0, 'The export contains no source nodes.');
  requireCondition(Array.isArray(source.assets), 'The export has no asset manifest.');
  requireCondition(Array.isArray(source.requiredAssets), 'The export has no required asset manifest.');
  requireCondition(Array.isArray(source.failedAssets) && source.failedAssets.length === 0, 'The export contains failed asset reads.');
  requireCondition(Array.isArray(source.warnings), 'The export has no warning manifest.');

  const ids = new Set();
  const stack = [...source.page.children];
  while (stack.length) {
    const node = stack.pop();
    requireCondition(node && typeof node.id === 'string' && node.id.length > 0 && typeof node.type === 'string', 'Invalid source node.');
    requireCondition(!ids.has(node.id), `Duplicate source node: ${node.id}`);
    ids.add(node.id);
    requireCondition(ids.size <= 100000, 'The source node count exceeds the import limit.');
    if (node.children !== undefined) {
      requireCondition(Array.isArray(node.children), `Invalid children for source node: ${node.id}`);
      stack.push(...node.children);
    }
  }

  const assets = [];
  const paths = new Set();
  let assetBytes = 0;
  for (const asset of source.assets) {
    requireCondition(asset && typeof asset.path === 'string', 'Invalid asset path.');
    requireCondition(/^(images|references|vectors)\/[A-Za-z0-9_-]+\.(png|jpe?g|webp|gif|svg)$/.test(asset.path), `Unsafe asset path: ${asset.path}`);
    const normalizedPath = asset.path.toLowerCase();
    requireCondition(!paths.has(normalizedPath), `Duplicate asset path: ${asset.path}`);
    paths.add(normalizedPath);
    requireCondition(['image', 'reference', 'vector'].includes(asset.kind), `Invalid asset kind: ${asset.path}`);
    const expectedDirectory = { image: 'images', reference: 'references', vector: 'vectors' }[asset.kind];
    requireCondition(asset.path.startsWith(`${expectedDirectory}/`), `Asset kind does not match its path: ${asset.path}`);
    requireCondition(MIME_EXTENSIONS.get(asset.mimeType)?.has(path.posix.extname(asset.path).toLowerCase()), `Unsupported or mismatched asset type: ${asset.path}`);
    requireCondition(typeof asset.dataBase64 === 'string' && asset.dataBase64.length > 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(asset.dataBase64), `Invalid asset encoding: ${asset.path}`);
    const bytes = Buffer.from(asset.dataBase64, 'base64');
    requireCondition(bytes.length > 0 && bytes.toString('base64') === asset.dataBase64, `Invalid asset data: ${asset.path}`);
    const signatures = {
      'image/png': () => bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.subarray(12, 16).toString('ascii') === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0,
      'image/jpeg': () => bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
      'image/gif': () => bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii')) && bytes.readUInt16LE(6) > 0 && bytes.readUInt16LE(8) > 0,
      'image/webp': () => bytes.length > 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP',
      'image/svg+xml': () => /<svg(?:\s|>)/.test(bytes.toString('utf8')),
    };
    requireCondition(signatures[asset.mimeType](), `Asset bytes do not match their format: ${asset.path}`);
    assetBytes += bytes.length;
    requireCondition(assetBytes <= MAX_ASSET_BYTES, 'The asset data exceeds the import limit.');
    if (asset.nodeId !== undefined) requireCondition(ids.has(asset.nodeId), `Asset references an unknown source node: ${asset.path}`);
    assets.push({ ...asset, bytes, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const requiredPaths = new Set();
  const assetsByPath = new Map(assets.map((asset) => [asset.path, asset]));
  for (const required of source.requiredAssets) {
    requireCondition(required && typeof required.path === 'string' && !requiredPaths.has(required.path), 'Invalid or duplicate required asset.');
    requiredPaths.add(required.path);
    const actual = assetsByPath.get(required.path);
    requireCondition(actual && actual.kind === required.kind && actual.nodeId === required.nodeId && actual.imageHash === required.imageHash, `Required asset is missing or mismatched: ${required.path}`);
  }
  requireCondition(requiredPaths.size === assets.length, 'The export contains assets absent from its required asset manifest.');
  requireCondition(assets.some((asset) => asset.kind === 'reference'), 'The export has no screen reference renders.');
  return { assets, nodes: ids.size, assetBytes };
}

export async function extractSource(inputPath, outputPath, options = {}) {
  const input = path.resolve(inputPath);
  const output = path.resolve(outputPath);
  requireCondition((await stat(input)).size <= MAX_INPUT_BYTES, 'The source export exceeds the input limit.');
  const source = JSON.parse(await readFile(input, 'utf8'));
  const validated = validateSource(source, options);
  // Never overwrite an existing source directory or any app files.
  await mkdir(output);
  const manifest = validated.assets.map(({ bytes, dataBase64, ...asset }) => asset);
  const sourceWithoutEmbeddedAssets = { ...source, assets: manifest };
  await writeFile(path.join(output, 'source.json'), `${JSON.stringify(sourceWithoutEmbeddedAssets, null, 2)}\n`, { flag: 'wx' });
  const directories = new Set(validated.assets.map((asset) => path.posix.dirname(asset.path)));
  for (const directory of directories) await mkdir(path.join(output, directory));
  for (const asset of validated.assets) {
    await writeFile(path.join(output, ...asset.path.split('/')), asset.bytes, { flag: 'wx' });
  }
  return { output, file: source.file, page: { id: source.page.id, name: source.page.name }, nodes: validated.nodes, assets: validated.assets.length, assetBytes: validated.assetBytes, warnings: source.warnings };
}

async function main() {
  const values = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    requireCondition(['--input', '--output', '--confirm-file-key'].includes(args[i]) && args[i + 1], 'Usage: node extract-source.mjs --input <export.json> --output <new-directory> [--confirm-file-key <key>]');
    requireCondition(values[args[i]] === undefined, `Repeated option: ${args[i]}`);
    values[args[i]] = args[i + 1];
  }
  requireCondition(values['--input'] && values['--output'], 'Provide --input and --output. The output directory must not already exist.');
  const result = await extractSource(values['--input'], values['--output'], { confirmedFileKey: values['--confirm-file-key'] });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
