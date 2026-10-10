// Downloads the on-device AI models listed in src/lib/ml/registry.ts into
// public/models/, so the app serves them from its own origin. Run once:
//   npm run setup:models
//
// Every file is pinned to a fixed upstream revision and checked against its
// registered size and SHA-256; a mismatching file is deleted and reported.
// Only models with status "ready" (used by a tool) are downloaded.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public', 'models');
const { MODELS, isSafeModelPath, modelBytes } = await import(pathToFileURL(join(root, 'src', 'lib', 'ml', 'registry.ts')).href);

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

async function sha256File(path) {
  const h = createHash('sha256');
  await pipeline(createReadStream(path), h);
  return h.digest('hex');
}

async function download(file, target) {
  const res = await fetch(file.url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const tmp = `${target}.part`;
  const hash = createHash('sha256');
  let received = 0;
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      received += chunk.length;
      if (received > file.bytes) return cb(new Error(`larger than the registered ${file.bytes} bytes`));
      cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body), meter, createWriteStream(tmp));
    if (received !== file.bytes) throw new Error(`got ${received} bytes, expected ${file.bytes}`);
    const digest = hash.digest('hex');
    if (digest !== file.sha256) throw new Error(`SHA-256 mismatch (got ${digest})`);
    renameSync(tmp, target);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

let failed = 0;
for (const model of MODELS.filter((m) => m.status === 'ready')) {
  console.log(`[models] ${model.name} (${model.licence}, ${mb(modelBytes(model))})`);
  for (const file of model.files) {
    if (!isSafeModelPath(file.path)) {
      console.error(`  ${file.path}: refused (not an allowed model file type)`);
      failed++;
      continue;
    }
    const target = join(dest, ...file.path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    if (existsSync(target) && statSync(target).size === file.bytes && (await sha256File(target)) === file.sha256) {
      console.log(`  ${file.path}: present, verified`);
      continue;
    }
    if (existsSync(target)) {
      console.log(`  ${file.path}: present but does not match its checksum; re-downloading`);
      rmSync(target);
    }
    process.stdout.write(`  ${file.path}: downloading ${mb(file.bytes)} … `);
    try {
      await download(file, target);
      console.log('verified');
    } catch (e) {
      console.log(`failed: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }
}
if (failed) {
  console.error(`[models] ${failed} file(s) could not be installed. Nothing unverified was kept.`);
  process.exitCode = 1;
}
