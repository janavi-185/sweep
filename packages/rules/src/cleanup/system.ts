import { SafetyRule, FileCategory } from '@sweep/types';

export const trashContents: SafetyRule = {
  id: 'trash',
  name: 'Trash Contents',
  description: 'Files currently in your Trash folder.',
  whySafeToRemove:
    'You explicitly moved these files to the Trash. Emptying the Trash permanently removes them and reclaims disk space.',
  category: FileCategory.Other,
  requiresConfirmation: true,
  paths: ['~/.Trash/**', '*/.Trash/**'],
};

export const tempFiles: SafetyRule = {
  id: 'temp-files',
  name: 'Temporary Files',
  description: 'Temporary scratch files left by applications (.tmp, .temp).',
  whySafeToRemove:
    'Temporary files are created as scratch space by applications and are not needed after applications close.',
  category: FileCategory.Temporary,
  requiresConfirmation: true,
  paths: ['**/*.tmp', '**/*.temp'],
};

export const systemRules: SafetyRule[] = [trashContents, tempFiles];
