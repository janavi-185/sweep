import { ScanResult, StorageBreakdown, CategoryBreakdown, FileCategory } from '../types';

export function computeBreakdown(scanResult: ScanResult): StorageBreakdown {
  const categoryMap: Map<FileCategory, { sizeBytes: number; fileCount: number }> = new Map();

  for (const file of scanResult.entries) {
    if (!file.isDirectory) {
      const current = categoryMap.get(file.category) || { sizeBytes: 0, fileCount: 0 };
      current.sizeBytes += file.sizeBytes;
      current.fileCount += 1;
      categoryMap.set(file.category, current);
    }
  }

  const byCategory: CategoryBreakdown[] = [];

  for (const [category, stats] of categoryMap.entries()) {
    if (stats.fileCount > 0) {
      const percentage =
        scanResult.totalSizeBytes > 0
          ? Number(((stats.sizeBytes / scanResult.totalSizeBytes) * 100).toFixed(1))
          : 0;

      byCategory.push({
        category,
        sizeBytes: stats.sizeBytes,
        fileCount: stats.fileCount,
        percentage,
      });
    }
  }

  byCategory.sort((a, b) => b.sizeBytes - a.sizeBytes);

  return {
    totalBytes: scanResult.totalSizeBytes,
    byCategory,
  };
}
