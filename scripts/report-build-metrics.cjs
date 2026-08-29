'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release');
const DIST_DIR = path.join(ROOT, 'dist');
const APP_DIR = path.join(RELEASE_DIR, 'linux-unpacked');
const ASAR_PATH = path.join(APP_DIR, 'resources', 'app.asar');
const SQUASHFS_MAGIC = Buffer.from('hsqs');
const SQUASHFS_SUPERBLOCK_BYTES = 96;
const DEFAULT_SQUASHFS_BLOCK_BYTES = 128 * 1024;
const TOP_FILE_LIMIT = 25;
const TOP_DIRECTORY_LIMIT = 25;

const BASELINES = Object.freeze({
  v200: 90911841,
  previousOptimizationCheckpoint: 83297939,
  preObservabilityCandidate: 81834404,
  normalCompressionValidated: 104271158,
});

const SQUASHFS_COMPRESSION = Object.freeze({
  1: 'gzip',
  2: 'lzma',
  3: 'lzo',
  4: 'xz',
  5: 'lz4',
  6: 'zstd',
});

function fileSize(filePath) {
  return fs.statSync(filePath).size;
}

function directorySize(directoryPath) {
  if (!fs.existsSync(directoryPath)) return null;
  let total = 0;
  const stack = [directoryPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile()) total += fileSize(entryPath);
    }
  }
  return total;
}

function listFiles(directoryPath, predicate = () => true) {
  if (!fs.existsSync(directoryPath)) return [];
  const files = [];
  const stack = [directoryPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile() && predicate(entryPath)) files.push(entryPath);
    }
  }
  return files.sort();
}

function listDirectories(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];
  const directories = [];
  const stack = [directoryPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(current, entry.name);
      directories.push(entryPath);
      stack.push(entryPath);
    }
  }
  return directories;
}

function relativeFromRoot(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function relativeFromApp(filePath) {
  return path.relative(APP_DIR, filePath).split(path.sep).join('/');
}

function bytesDelta(value, baseline) {
  if (value === null) return null;
  const bytes = value - baseline;
  return {
    bytes,
    percent: Number(((bytes / baseline) * 100).toFixed(2)),
  };
}

function mib(bytes) {
  if (bytes === null || bytes === undefined) return null;
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function topLevelBreakdown(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];
  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .map((entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      return {
        name: entry.name,
        bytes: entry.isDirectory() ? directorySize(entryPath) : fileSize(entryPath),
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
}

function largestFiles(directoryPath, limit = TOP_FILE_LIMIT) {
  return listFiles(directoryPath)
    .map((filePath) => ({
      path: relativeFromApp(filePath),
      bytes: fileSize(filePath),
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

function largestDirectories(directoryPath, limit = TOP_DIRECTORY_LIMIT) {
  return listDirectories(directoryPath)
    .map((dirPath) => ({
      path: relativeFromApp(dirPath),
      bytes: directorySize(dirPath),
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

function appImageFilesystemOffset(appImagePath) {
  const result = spawnSync(appImagePath, ['--appimage-offset'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (result.error) {
    throw new Error(`Unable to query AppImage filesystem offset: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `AppImage --appimage-offset exited with status ${result.status}: ${result.stderr.trim()}`
    );
  }

  const value = result.stdout.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid AppImage filesystem offset: ${JSON.stringify(value)}`);
  }

  const offset = Number(value);
  const appImageBytes = fileSize(appImagePath);
  if (
    !Number.isSafeInteger(offset) ||
    offset <= 0 ||
    offset + SQUASHFS_SUPERBLOCK_BYTES > appImageBytes
  ) {
    throw new Error(`AppImage filesystem offset is outside artifact bounds: ${offset}`);
  }
  return offset;
}

function readSquashfsMetadata(appImagePath) {
  if (!appImagePath || !fs.existsSync(appImagePath)) return null;

  const offset = appImageFilesystemOffset(appImagePath);
  const superblock = Buffer.alloc(SQUASHFS_SUPERBLOCK_BYTES);
  const fd = fs.openSync(appImagePath, 'r');
  try {
    const bytesRead = fs.readSync(fd, superblock, 0, superblock.length, offset);
    if (bytesRead !== superblock.length) {
      throw new Error(`Unable to read complete SquashFS superblock at offset ${offset}`);
    }
  } finally {
    fs.closeSync(fd);
  }

  if (!superblock.subarray(0, 4).equals(SQUASHFS_MAGIC)) {
    throw new Error(`SquashFS magic missing at AppImage-reported offset ${offset}`);
  }

  const blockSize = superblock.readUInt32LE(12);
  const compressionId = superblock.readUInt16LE(20);
  const major = superblock.readUInt16LE(28);
  const minor = superblock.readUInt16LE(30);
  const bytesUsed = Number(superblock.readBigUInt64LE(40));
  const appImageBytes = fileSize(appImagePath);
  const compression = SQUASHFS_COMPRESSION[compressionId];

  if (major !== 4 || minor !== 0) {
    throw new Error(`Unsupported SquashFS version ${major}.${minor}`);
  }
  if (!compression) {
    throw new Error(`Unsupported SquashFS compression id ${compressionId}`);
  }
  if (
    !Number.isSafeInteger(blockSize) ||
    blockSize < 4096 ||
    (blockSize & (blockSize - 1)) !== 0
  ) {
    throw new Error(`Invalid SquashFS block size ${blockSize}`);
  }
  if (
    !Number.isSafeInteger(bytesUsed) ||
    bytesUsed <= 0 ||
    offset + bytesUsed > appImageBytes
  ) {
    throw new Error(`Invalid SquashFS bytes_used ${bytesUsed}`);
  }

  return {
    offsetBytes: offset,
    runtimeBytes: offset,
    version: `${major}.${minor}`,
    compressionId,
    compression,
    blockSizeBytes: blockSize,
    bytesUsed,
    trailingBytes: appImageBytes - offset - bytesUsed,
  };
}

function estimateGzipSquashfsFileBytes(filePath, blockSizeBytes) {
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(blockSizeBytes);
  let total = 0;
  try {
    while (true) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      const block = bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead);
      const compressed = zlib.deflateRawSync(block, { level: 9 });
      total += Math.min(bytesRead, compressed.length);
    }
  } finally {
    fs.closeSync(fd);
  }
  return total;
}

function compressedContributionEstimate(directoryPath, squashfs) {
  if (!squashfs || squashfs.compression !== 'gzip') return null;
  const blockSizeBytes = squashfs.blockSizeBytes || DEFAULT_SQUASHFS_BLOCK_BYTES;
  const files = listFiles(directoryPath).map((filePath) => {
    const bytes = fileSize(filePath);
    const estimatedCompressedBytes = estimateGzipSquashfsFileBytes(
      filePath,
      blockSizeBytes
    );
    return {
      path: relativeFromApp(filePath),
      bytes,
      estimatedCompressedBytes,
      estimatedRatio:
        bytes === 0 ? 0 : Number((estimatedCompressedBytes / bytes).toFixed(4)),
    };
  });

  files.sort((a, b) => b.estimatedCompressedBytes - a.estimatedCompressedBytes);
  return {
    method:
      'gzip level 9 independently per SquashFS-sized file block; excludes filesystem metadata and cross-file packing effects',
    topFiles: files.slice(0, TOP_FILE_LIMIT),
    estimatedFilesTotalBytes: files.reduce(
      (sum, item) => sum + item.estimatedCompressedBytes,
      0
    ),
  };
}

function buildReport() {
  const appImages = listFiles(
    RELEASE_DIR,
    (filePath) =>
      path.dirname(filePath) === RELEASE_DIR && filePath.endsWith('.AppImage')
  );
  const appImagePath = appImages.length === 1 ? appImages[0] : null;
  const appImageBytes = appImagePath ? fileSize(appImagePath) : null;
  const squashfs = readSquashfsMetadata(appImagePath);
  const jsChunks = listFiles(DIST_DIR, (filePath) => filePath.endsWith('.js')).map(
    (filePath) => ({ path: relativeFromRoot(filePath), bytes: fileSize(filePath) })
  );

  return {
    generatedAt: new Date().toISOString(),
    distBytes: directorySize(DIST_DIR),
    assetBytes: directorySize(path.join(DIST_DIR, 'resources', 'assets')),
    assetBreakdown: topLevelBreakdown(path.join(DIST_DIR, 'resources', 'assets')),
    jsChunks,
    jsTotalBytes: jsChunks.reduce((sum, chunk) => sum + chunk.bytes, 0),
    appAsarBytes: fs.existsSync(ASAR_PATH) ? fileSize(ASAR_PATH) : null,
    linuxUnpackedBytes: directorySize(APP_DIR),
    linuxUnpackedBreakdown: topLevelBreakdown(APP_DIR),
    linuxUnpackedLargestFiles: largestFiles(APP_DIR),
    linuxUnpackedLargestDirectories: largestDirectories(APP_DIR),
    squashfs,
    compressedContributionEstimate: compressedContributionEstimate(APP_DIR, squashfs),
    appImage: appImagePath
      ? {
          path: relativeFromRoot(appImagePath),
          bytes: appImageBytes,
          mib: mib(appImageBytes),
        }
      : null,
    baselines: BASELINES,
    appImageDeltas: appImageBytes
      ? Object.fromEntries(
          Object.entries(BASELINES).map(([name, baseline]) => [
            name,
            bytesDelta(appImageBytes, baseline),
          ])
        )
      : null,
  };
}

function markdown(report) {
  const lines = [
    '## Build size report',
    '',
    `- dist: \`${report.distBytes ?? 'n/a'}\` bytes`,
    `- production assets: \`${report.assetBytes ?? 'n/a'}\` bytes`,
    `- JavaScript total: \`${report.jsTotalBytes}\` bytes`,
    `- app.asar: \`${report.appAsarBytes ?? 'n/a'}\` bytes`,
    `- linux-unpacked logical size: \`${report.linuxUnpackedBytes ?? 'n/a'}\` bytes`,
    `- AppImage: \`${report.appImage?.bytes ?? 'n/a'}\` bytes${
      report.appImage ? ` (\`${report.appImage.mib}\` MiB)` : ''
    }`,
  ];

  if (report.squashfs) {
    lines.push(
      `- AppImage runtime prefix: \`${report.squashfs.runtimeBytes}\` bytes`,
      `- SquashFS: \`${report.squashfs.compression}\`, block \`${report.squashfs.blockSizeBytes}\` bytes, filesystem \`${report.squashfs.bytesUsed}\` bytes`,
      `- AppImage trailing data: \`${report.squashfs.trailingBytes}\` bytes`
    );
  }

  lines.push(
    '',
    '### Largest linux-unpacked files',
    '',
    '| File | Logical bytes |',
    '|---|---:|',
    ...report.linuxUnpackedLargestFiles.map(
      (item) => `| \`${item.path}\` | ${item.bytes} |`
    ),
    '',
    '### Largest linux-unpacked directories',
    '',
    '| Directory | Logical bytes |',
    '|---|---:|',
    ...report.linuxUnpackedLargestDirectories.map(
      (item) => `| \`${item.path}\` | ${item.bytes} |`
    ),
    '',
    '### JavaScript chunks',
    '',
    '| Chunk | Bytes |',
    '|---|---:|',
    ...report.jsChunks.map((chunk) => `| \`${chunk.path}\` | ${chunk.bytes} |`)
  );

  if (report.compressedContributionEstimate) {
    lines.push(
      '',
      '### Estimated compressed contribution',
      '',
      `Method: ${report.compressedContributionEstimate.method}.`,
      '',
      '| File | Logical bytes | Estimated compressed bytes |',
      '|---|---:|---:|',
      ...report.compressedContributionEstimate.topFiles.map(
        (item) =>
          `| \`${item.path}\` | ${item.bytes} | ${item.estimatedCompressedBytes} |`
      )
    );
  }

  if (report.appImageDeltas) {
    lines.push(
      '',
      '### AppImage baselines',
      '',
      `- v2.0.0 (90,911,841 bytes): \`${report.appImageDeltas.v200.bytes}\` bytes (${report.appImageDeltas.v200.percent >= 0 ? '+' : ''}${report.appImageDeltas.v200.percent}%)`,
      `- previous optimization checkpoint (83,297,939 bytes): \`${report.appImageDeltas.previousOptimizationCheckpoint.bytes}\` bytes (${report.appImageDeltas.previousOptimizationCheckpoint.percent >= 0 ? '+' : ''}${report.appImageDeltas.previousOptimizationCheckpoint.percent}%)`,
      `- pre-observability v2.1 candidate (81,834,404 bytes): \`${report.appImageDeltas.preObservabilityCandidate.bytes}\` bytes (${report.appImageDeltas.preObservabilityCandidate.percent >= 0 ? '+' : ''}${report.appImageDeltas.preObservabilityCandidate.percent}%)`,
      `- validated normal-compression baseline (104,271,158 bytes): \`${report.appImageDeltas.normalCompressionValidated.bytes}\` bytes (${report.appImageDeltas.normalCompressionValidated.percent >= 0 ? '+' : ''}${report.appImageDeltas.normalCompressionValidated.percent}%)`
    );
  }

  return `${lines.join('\n')}\n`;
}

const report = buildReport();
const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

const markdownOutput = markdown(report);
process.stdout.write(markdownOutput);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownOutput);
}
