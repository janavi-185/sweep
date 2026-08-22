import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { traverseDirectory, deleteItem, trashRule } from '../packages/core/src';
import { FsEntry, SafetyRule, CleanupCandidate, FileCategory } from '../packages/types/src';

describe('Confirmed Bug Fixes Test Suite', () => {
  const testDir = path.join(os.tmpdir(), `sweep-bugfixes-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(path.join(testDir, 'folderA/nestedA'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'folderB'), { recursive: true });

    // folderA/nestedA contains 2 files
    fs.writeFileSync(path.join(testDir, 'folderA/nestedA/file1.txt'), 'hello 1');
    fs.writeFileSync(path.join(testDir, 'folderA/nestedA/file2.txt'), 'hello 2');
    // folderA contains 1 direct file (total inside folderA = 3)
    fs.writeFileSync(path.join(testDir, 'folderA/file3.txt'), 'hello 3');
    // folderB contains 1 file
    fs.writeFileSync(path.join(testDir, 'folderB/file4.txt'), 'hello 4');
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('Bug 1 Fix: DirectoryEntry.fileCount correctly reflects files in subtree only', async () => {
    const result = await traverseDirectory(testDir);

    const nestedADir = result.directories.find((d) => d.name === 'nestedA');
    const folderADir = result.directories.find((d) => d.name === 'folderA');
    const folderBDir = result.directories.find((d) => d.name === 'folderB');

    expect(nestedADir).toBeDefined();
    expect(nestedADir!.fileCount).toBe(2);

    expect(folderADir).toBeDefined();
    expect(folderADir!.fileCount).toBe(3); // 2 in nestedA + 1 direct file3.txt

    expect(folderBDir).toBeDefined();
    expect(folderBDir!.fileCount).toBe(1);
  });

  it('Bug 2 & 4 Fix: deleteItem correctly checks resolvedPath safety and returns skipped for missing files', async () => {
    const missingFilePath = path.join(testDir, 'non_existent_file.tmp');
    const dummyRule: SafetyRule = {
      id: 'system_tmp',
      name: 'Temp Files',
      description: 'Temp files',
      whySafeToRemove: 'Safe',
      paths: ['**/*.tmp'],
      category: FileCategory.Temporary,
      requiresConfirmation: true,
    };

    const candidate: CleanupCandidate = {
      id: `system_tmp:${missingFilePath}`,
      path: missingFilePath,
      name: 'non_existent_file.tmp',
      sizeBytes: 100,
      rule: dummyRule,
      reason: 'temp_files',
      explanation: 'Missing file candidate',
    };

    const result = await deleteItem(candidate, false);
    expect(result.actionTaken).toBe('skipped');
    expect(result.freedBytes).toBe(0);
    expect(result.error).toContain('Item no longer exists');
  });

  it('Bug 3 Fix: trashRule strictly matches macOS Trash paths and ignores non-trash paths containing /trash', () => {
    const mockEntries: FsEntry[] = [
      {
        path: '/Users/testuser/.Trash/document.pdf',
        name: 'document.pdf',
        extension: '.pdf',
        sizeBytes: 500,
        modifiedAt: new Date(),
        isDirectory: false,
        category: FileCategory.Document,
        isHidden: true,
        isSymlink: false,
      },
      {
        path: '/Users/testuser/projects/trash-sorter/index.ts',
        name: 'index.ts',
        extension: '.ts',
        sizeBytes: 1000,
        modifiedAt: new Date(),
        isDirectory: false,
        category: FileCategory.Code,
        isHidden: false,
        isSymlink: false,
      },
      {
        path: '/Volumes/Data/.Trashes/501/old_video.mp4',
        name: 'old_video.mp4',
        extension: '.mp4',
        sizeBytes: 2000,
        modifiedAt: new Date(),
        isDirectory: false,
        category: FileCategory.Video,
        isHidden: true,
        isSymlink: false,
      },
    ];

    const candidates = trashRule(mockEntries, '/');
    const paths = candidates.map((c) => c.path);

    expect(paths).toContain('/Users/testuser/.Trash/document.pdf');
    expect(paths).toContain('/Volumes/Data/.Trashes/501/old_video.mp4');
    expect(paths).not.toContain('/Users/testuser/projects/trash-sorter/index.ts');
  });
});
