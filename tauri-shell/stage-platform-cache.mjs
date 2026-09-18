import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export function canReuseStagedNodeModules(skipNpm, targetPlatform, targetArch, nodeModules, stampFile) {
  if (!skipNpm || !existsSync(nodeModules) || !existsSync(stampFile)) return false;
  try {
    return readFileSync(stampFile, 'utf8').trim() === `${targetPlatform}-${targetArch}`;
  } catch {
    return false;
  }
}

export function writeStagedPlatformStamp(stampFile, targetPlatform, targetArch) {
  writeFileSync(stampFile, `${targetPlatform}-${targetArch}\n`, 'utf8');
}
