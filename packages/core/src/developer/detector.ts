import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DevToolDefinition, DevToolResult, MeasuredPath, DevStorageReport } from '../types';

async function getPathSizeBytes(targetPath: string): Promise<number> {
  try {
    const stat = await fs.lstat(targetPath);

    if (stat.isSymbolicLink()) {
      return stat.size;
    }

    if (!stat.isDirectory()) {
      return stat.size;
    }

    let total = 0;
    const entries = await fs.readdir(targetPath, { withFileTypes: true });

    const sizes = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(targetPath, entry.name);
        try {
          if (entry.isSymbolicLink()) {
            const symStat = await fs.lstat(fullPath);
            return symStat.size;
          }
          if (entry.isDirectory()) {
            return await getPathSizeBytes(fullPath);
          }
          const fileStat = await fs.stat(fullPath);
          return fileStat.size;
        } catch {
          return 0;
        }
      }),
    );

    for (const s of sizes) {
      total += s;
    }

    return total;
  } catch {
    return 0;
  }
}

async function measureDevToolPath(rawPath: string, label: string): Promise<MeasuredPath> {
  const resolvedPath = rawPath.replace(/^~(?=$|\/)/, os.homedir());
  try {
    await fs.access(resolvedPath);
    const sizeBytes = await getPathSizeBytes(resolvedPath);
    return {
      path: rawPath,
      label,
      sizeBytes,
      exists: true,
    };
  } catch {
    return {
      path: rawPath,
      label,
      sizeBytes: 0,
      exists: false,
    };
  }
}

export async function detectDevTool(tool: DevToolDefinition): Promise<DevToolResult> {
  const measuredPaths = await Promise.all(
    tool.paths.map((p) => measureDevToolPath(p.path, p.label)),
  );

  const existingPaths = measuredPaths.filter((p) => p.exists);
  const isInstalled = existingPaths.length > 0;
  const totalSizeBytes = measuredPaths.reduce((acc, p) => acc + p.sizeBytes, 0);

  return {
    tool,
    isInstalled,
    totalSizeBytes,
    measuredPaths,
  };
}

export async function detectDevStorage(
  definitions: DevToolDefinition[],
): Promise<DevStorageReport> {
  const results = await Promise.all(definitions.map((def) => detectDevTool(def)));

  let grandTotalBytes = 0;
  let installedCount = 0;
  let notInstalledCount = 0;

  for (const res of results) {
    if (res.isInstalled) {
      installedCount += 1;
      grandTotalBytes += res.totalSizeBytes;
    } else {
      notInstalledCount += 1;
    }
  }

  // Sort installed tools by totalSizeBytes descending
  results.sort((a, b) => b.totalSizeBytes - a.totalSizeBytes);

  return {
    generatedAt: new Date(),
    tools: results,
    grandTotalBytes,
    installedCount,
    notInstalledCount,
  };
}
