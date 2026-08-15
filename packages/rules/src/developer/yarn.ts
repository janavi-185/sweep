import { DevToolDefinition } from './types';

export const yarn: DevToolDefinition = {
  id: 'yarn',
  name: 'Yarn',
  description: 'Yarn global package cache',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.yarn/cache',
      label: 'Yarn Cache',
      description: 'Global Yarn Classic cache.',
    },
    {
      path: '~/Library/Caches/yarn',
      label: 'Yarn Cache (Berry)',
      description: 'Cache used by Yarn Berry (v2+).',
    },
  ],
};
