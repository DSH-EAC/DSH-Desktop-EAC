'use strict';

import fs = require('node:fs');
import path = require('node:path');

export interface DesktopCapabilities {
  clipboard: 'supported' | 'external-dependency' | 'unavailable';
  processFence: 'job-object' | 'degraded';
}

export interface DesktopPlatform {
  userDataDir(): string;
  runtimeExecutableName(): string;
  capabilities(): DesktopCapabilities;
}

export interface DesktopPlatformOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  commandExists?: (file: string) => boolean;
}

export function nodeExecutableName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'node.exe' : 'node';
}

function defaultCommandExists(file: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): boolean {
  const pathValue = env.PATH || env.Path || env.path || '';
  const delimiter = platform === 'win32' ? ';' : ':';
  const extensions = platform === 'win32'
    ? (env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  for (const dir of pathValue.split(delimiter).filter(Boolean)) {
    for (const ext of extensions) {
      const candidate = path.join(dir, platform === 'win32' ? file + ext.toLowerCase() : file);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return true;
      } catch { /* continue */ }
    }
  }
  return false;
}

export function createDesktopPlatform(options: DesktopPlatformOptions = {}): DesktopPlatform {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? require('node:os').homedir();
  const commandExists = options.commandExists ?? ((file: string) => defaultCommandExists(file, platform, env));

  const userDataDir = (): string => {
    if (platform === 'win32') {
      const appData = env.APPDATA || path.win32.join(homeDir, 'AppData', 'Roaming');
      return path.win32.join(appData, 'Deepseek Harness EAC');
    }
    if (platform === 'linux') {
      const configHome = env.XDG_CONFIG_HOME || path.posix.join(homeDir, '.config');
      return path.posix.join(configHome, 'deepseek-harness-eac');
    }
    if (platform === 'darwin') {
      // macOS 惯例：~/Library/Application Support/<app>（不经 XDG fallback）。
      return path.posix.join(homeDir, 'Library', 'Application Support', 'deepseek-harness-eac');
    }
    const configHome = env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
    return path.join(configHome, 'deepseek-harness-eac');
  };

  const capabilities = (): DesktopCapabilities => ({
    clipboard: platform === 'win32'
      ? 'supported'
      : platform === 'linux' && (commandExists('wl-copy') || commandExists('xclip') || commandExists('xsel'))
        ? 'supported'
        : platform === 'darwin'
          ? 'supported' // pbcopy/pbpaste 为 macOS 内置
          : platform === 'linux' ? 'external-dependency' : 'unavailable',
    processFence: platform === 'win32' ? 'job-object' : 'degraded',
  });

  return {
    userDataDir,
    runtimeExecutableName: () => nodeExecutableName(platform),
    capabilities,
  };
}
