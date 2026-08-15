import { DevToolDefinition } from './types';

export const flutter: DevToolDefinition = {
  id: 'flutter',
  name: 'Flutter & Dart',
  description: 'Flutter SDK artifacts, Dart SDK, and pub package cache',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.pub-cache',
      label: 'Pub Cache',
      description: 'Downloaded Dart & Flutter package dependencies.',
    },
    {
      path: '~/Library/Caches/Dart',
      label: 'Dart SDK Cache',
      description: 'Dart SDK compilation caches.',
    },
  ],
};
