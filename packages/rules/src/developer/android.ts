import { DevToolDefinition } from './types';

export const android: DevToolDefinition = {
  id: 'android',
  name: 'Android SDK',
  description: 'Android SDK, emulator images, and build tools',
  isSafeToClean: false,
  paths: [
    {
      path: '~/Library/Android/sdk',
      label: 'Android SDK',
      description: 'Android SDK installation directory.',
    },
  ],
};
