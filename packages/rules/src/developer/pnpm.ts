import { DevToolDefinition } from './types';

export const pnpm: DevToolDefinition = {
  id: 'pnpm',
  name: 'pnpm',
  description: 'pnpm content-addressable package store',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.pnpm-store',
      label: 'pnpm Store',
      description: 'Global package store shared across projects.',
    },
    {
      path: '~/Library/pnpm/store',
      label: 'pnpm Store (alternate)',
      description: 'Alternate store location used by newer pnpm versions.',
    },
  ],
};
