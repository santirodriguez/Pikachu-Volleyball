'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function runAsar(asarBin, args, options = {}) {
  return execFileSync(asarBin, args, {
    stdio: options.encoding ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    ...options,
  });
}

exports.default = async function prunePackagedNodeModules(context) {
  if (context.electronPlatformName !== 'linux') {
    return;
  }

  const projectDir = context.packager.projectDir || process.cwd();
  const asarBin = path.join(projectDir, 'node_modules', '.bin', 'asar');
  const asarPath = path.join(context.appOutDir, 'resources', 'app.asar');

  if (!fs.existsSync(asarBin)) {
    throw new Error(`Missing ASAR CLI: ${asarBin}`);
  }
  if (!fs.existsSync(asarPath)) {
    throw new Error(`Missing packaged app archive: ${asarPath}`);
  }

  const originalBytes = fs.statSync(asarPath).size;
  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pikachu-volleyball-asar-')
  );
  const extractedDir = path.join(workDir, 'app');
  const rebuiltAsar = path.join(workDir, 'app.asar');

  try {
    runAsar(asarBin, ['extract', asarPath, extractedDir]);

    const packagedNodeModules = path.join(extractedDir, 'node_modules');
    if (!fs.existsSync(packagedNodeModules)) {
      console.log('Packaged app already contains no node_modules; skipping prune.');
      return;
    }

    fs.rmSync(packagedNodeModules, { recursive: true, force: true });

    const packagedManifestPath = path.join(extractedDir, 'package.json');
    const packagedManifest = JSON.parse(
      fs.readFileSync(packagedManifestPath, 'utf8')
    );
    delete packagedManifest.dependencies;
    fs.writeFileSync(
      packagedManifestPath,
      `${JSON.stringify(packagedManifest, null, 2)}\n`,
      'utf8'
    );

    runAsar(asarBin, ['pack', extractedDir, rebuiltAsar]);

    const listing = runAsar(asarBin, ['list', rebuiltAsar], {
      encoding: 'utf8',
    });
    if (listing.split(/\r?\n/).some((entry) => entry.startsWith('/node_modules/'))) {
      throw new Error('Rebuilt app.asar still contains node_modules');
    }

    fs.renameSync(rebuiltAsar, asarPath);

    const finalBytes = fs.statSync(asarPath).size;
    const savedBytes = originalBytes - finalBytes;
    console.log(
      `Pruned packaged node_modules: ${originalBytes} -> ${finalBytes} bytes (${savedBytes} bytes removed).`
    );
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
};
