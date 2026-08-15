import { DevToolDefinition } from './types';

export const java: DevToolDefinition = {
  id: 'java',
  name: 'Java / Maven',
  description: 'Maven local repository of downloaded JARs and dependencies',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.m2',
      label: 'Maven Local Repository',
      description: 'Downloaded Maven artifacts.',
    },
  ],
};
