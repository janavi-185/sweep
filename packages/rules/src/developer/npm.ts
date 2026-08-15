import { DevToolDefinition } from './types';

export const npm: DevToolDefinition = {
  id: 'npm',
  name: 'npm',
  description: 'npm global package cache',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.npm',
      label: 'npm Cache',
      description: 'Global npm package cache.',
    },
  ],
};
