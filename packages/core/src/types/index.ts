/**
 * Shared Type Definitions for Sweep
 */

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
