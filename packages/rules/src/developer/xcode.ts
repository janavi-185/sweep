import { DevToolDefinition } from './types';

export const xcode: DevToolDefinition = {
  id: 'xcode',
  name: 'Xcode',
  description: 'Build artifacts, device support files, and app archives',
  isSafeToClean: true,
  paths: [
    {
      path: '~/Library/Developer/Xcode/DerivedData',
      label: 'Derived Data',
      description: 'Build artifacts generated per-project. Fully regeneratable.',
    },
    {
      path: '~/Library/Developer/Xcode/Archives',
      label: 'Archives',
      description: 'App archives created for distribution.',
    },
    {
      path: '~/Library/Developer/Xcode/iOS DeviceSupport',
      label: 'iOS Device Support',
      description: 'Debug symbols downloaded per iOS device + version.',
    },
    {
      path: '~/Library/Developer/CoreSimulator/Caches',
      label: 'Simulator Caches',
      description: 'Simulator runtime caches. Regenerated on next launch.',
    },
  ],
};
