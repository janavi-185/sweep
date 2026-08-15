import { DevToolDefinition } from './types';

export const homebrew: DevToolDefinition = {
  id: 'homebrew',
  name: 'Homebrew',
  description: 'Homebrew package cache and installed formulae',
  isSafeToClean: true,
  paths: [
    {
      path: '~/Library/Caches/Homebrew',
      label: 'Homebrew Cache',
      description: 'Downloaded package sources and bottles.',
    },
    {
      path: '/opt/homebrew/Cellar',
      label: 'Homebrew Cellar (Apple Silicon)',
      description: 'Installed Homebrew formulae on Apple Silicon.',
    },
    {
      path: '/usr/local/Cellar',
      label: 'Homebrew Cellar (Intel)',
      description: 'Installed Homebrew formulae on Intel Macs.',
    },
  ],
};
