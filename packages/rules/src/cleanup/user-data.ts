import { SafetyRule, FileCategory } from '@sweep/types';

export const staleDownloads: SafetyRule = {
  id: 'stale-downloads',
  name: 'Stale Downloads',
  description: 'Files in Downloads directory untouched for over 30 days.',
  whySafeToRemove:
    'Downloaded files that have not been modified or accessed in 30 days often represent old installers or archives.',
  category: FileCategory.Document,
  requiresConfirmation: true,
  paths: ['~/Downloads/**'],
};

export const userDataRules: SafetyRule[] = [staleDownloads];
