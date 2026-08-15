import { DevToolDefinition } from './types';

export const gradle: DevToolDefinition = {
  id: 'gradle',
  name: 'Gradle',
  description: 'Gradle build cache and downloaded dependencies',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.gradle/caches',
      label: 'Gradle Caches',
      description: 'Downloaded dependencies and build cache.',
    },
    {
      path: '~/.gradle/wrapper',
      label: 'Gradle Wrapper',
      description: 'Downloaded Gradle distributions.',
    },
  ],
};
