import { DevToolDefinition } from './types';

export const docker: DevToolDefinition = {
  id: 'docker',
  name: 'Docker Desktop',
  description: 'Container images, volumes, and Docker Desktop data',
  isSafeToClean: false,
  paths: [
    {
      path: '~/Library/Containers/com.docker.docker',
      label: 'Docker Desktop Data',
      description: 'Docker VM disk image and settings.',
    },
    {
      path: '~/.docker',
      label: 'Docker Config',
      description: 'Docker CLI config, credentials, and context files.',
    },
  ],
};
