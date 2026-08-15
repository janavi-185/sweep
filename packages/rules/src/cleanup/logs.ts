import { SafetyRule, FileCategory } from '@sweep/types';

export const oldLogs: SafetyRule = {
  id: 'old-logs',
  name: 'Old Log Files',
  description: 'Log files older than 30 days.',
  whySafeToRemove:
    'Application log files older than 30 days are generally no longer needed for troubleshooting.',
  category: FileCategory.Log,
  requiresConfirmation: true,
  paths: ['**/*.log', '**/Logs/**', '**/log/**'],
};

export const logRules: SafetyRule[] = [oldLogs];
