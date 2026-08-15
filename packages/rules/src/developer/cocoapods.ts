import { DevToolDefinition } from './types';

export const cocoapods: DevToolDefinition = {
  id: 'cocoapods',
  name: 'CocoaPods',
  description: 'CocoaPods spec repo and download cache',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.cocoapods',
      label: 'CocoaPods Cache',
      description: 'Spec repo and downloaded pod sources.',
    },
  ],
};
