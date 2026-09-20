'use strict';

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SUPPORTED_ARCHES = new Set(['x64', 'arm64']);

export function prepareWebView2Loader({ cargoHome, arch, staged }) {
  if (!SUPPORTED_ARCHES.has(arch)) {
    throw new Error(`[webview2-loader] unsupported architecture: ${arch}`);
  }

  const registryRoot = path.join(cargoHome, 'registry', 'src');
  if (!existsSync(registryRoot)) {
    throw new Error(`[webview2-loader] Cargo registry source is missing: ${registryRoot}`);
  }

  for (const bucket of readdirSync(registryRoot).sort().reverse()) {
    const bucketDir = path.join(registryRoot, bucket);
    for (const crate of readdirSync(bucketDir).sort().reverse()) {
      if (!crate.startsWith('webview2-com-sys-')) continue;
      const source = path.join(bucketDir, crate, arch, 'WebView2Loader.dll');
      if (!existsSync(source)) continue;

      mkdirSync(staged, { recursive: true });
      const destination = path.join(staged, 'WebView2Loader.dll');
      cpSync(source, destination);
      return destination;
    }
  }

  throw new Error(`[webview2-loader] ${arch}/WebView2Loader.dll not found under ${registryRoot}; run cargo fetch --locked first`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const archArg = process.argv.find((arg) => arg.startsWith('--arch='));
  const stagedArg = process.argv.find((arg) => arg.startsWith('--staged='));
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const cargoHome = process.env.CARGO_HOME || path.join(homeDir, '.cargo');
  const arch = archArg ? archArg.slice('--arch='.length) : process.arch;
  const staged = stagedArg
    ? path.resolve(stagedArg.slice('--staged='.length))
    : path.resolve(path.dirname(process.argv[1]), 'staged-resources');

  try {
    const destination = prepareWebView2Loader({ cargoHome, arch, staged });
    console.log(`[webview2-loader] prepared ${destination}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
