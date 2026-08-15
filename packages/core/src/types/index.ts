/**
 * Shared Type Definitions for Sweep
 */

export * from '@sweep/rules';

export enum FileCategory {
  Video = 'Videos',
  Audio = 'Audio',
  Image = 'Images',
  Document = 'Documents',
  Archive = 'Archives',
  Code = 'Code',
  Data = 'Data',
  Executable = 'Executables',
  Cache = 'Cache',
  Log = 'Logs',
  Temporary = 'Temporary',
  Other = 'Other',
}

export interface FileEntry {
  path: string;
  name: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: Date;
  isDirectory: false;
  category: FileCategory;
  isHidden: boolean;
  isSymlink: boolean;
}

export interface DirectoryEntry {
  path: string;
  name: string;
  sizeBytes: number;
  fileCount: number;
  isHidden: boolean;
  isSymlink: boolean;
  isDirectory: true;
}

export type FsEntry = FileEntry | DirectoryEntry;

export interface CategorySummary {
  category: FileCategory;
  sizeBytes: number;
  fileCount: number;
  percentage: number;
}

export interface ScanResult {
  rootPath: string;
  scannedAt: Date;
  durationMs: number;
  totalSizeBytes: number;
  fileCount: number;
  directoryCount: number;
  skippedCount: number;
  categories: CategorySummary[];
  largestFiles: FileEntry[];
  largestDirectories: DirectoryEntry[];
  entries: FsEntry[];
}

export interface ScanOptions {
  maxDepth?: number | undefined;
  includeHidden?: boolean | undefined;
}

export type ProgressCallback = (scannedCount: number, currentPath: string) => void;

export interface CategoryBreakdown {
  category: FileCategory;
  sizeBytes: number;
  fileCount: number;
  percentage: number;
}

export interface StorageBreakdown {
  totalBytes: number;
  byCategory: CategoryBreakdown[];
}

export type CandidateReason =
  'trash' | 'stale_downloads' | 'large_cache' | 'old_logs' | 'temp_files' | 'duplicate';

export type CandidateCategory = 'system' | 'user_data' | 'cache' | 'logs' | 'developer';

export interface AnalyzerCleanupCandidate {
  path: string;
  sizeBytes: number;
  reason: CandidateReason;
  explanation: string;
  category: CandidateCategory;
  isSafeToClean: boolean;
}

export interface AnalysisResult {
  scanResult: ScanResult;
  analyzedAt: Date;
  breakdown: StorageBreakdown;
  topFiles: FileEntry[];
  topDirectories: DirectoryEntry[];
  candidates: AnalyzerCleanupCandidate[];
}

export interface AnalyzeOptions {
  topN?: number | undefined;
}

export interface MeasuredPath {
  path: string;
  label: string;
  sizeBytes: number;
  exists: boolean;
}

export interface DevToolResult {
  tool: import('@sweep/rules').DevToolDefinition;
  isInstalled: boolean;
  totalSizeBytes: number;
  measuredPaths: MeasuredPath[];
}

export interface DevStorageReport {
  generatedAt: Date;
  tools: DevToolResult[];
  grandTotalBytes: number;
  installedCount: number;
  notInstalledCount: number;
}

export interface SafetyRule {
  id: string;
  name: string;
  description: string;
  whySafeToRemove: string;
  paths: string[];
  category: FileCategory;
  requiresConfirmation: true;
}

export interface CleanupCandidate {
  id: string;
  path: string;
  name: string;
  sizeBytes: number;
  rule: SafetyRule;
  reason: string;
}
