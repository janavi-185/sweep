import { DevToolDefinition } from './types';

export const python: DevToolDefinition = {
  id: 'python',
  name: 'Python',
  description: 'pyenv versions, virtualenvs, and pip cache',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.pyenv',
      label: 'pyenv',
      description: 'Python versions managed by pyenv.',
    },
    {
      path: '~/.virtualenvs',
      label: 'virtualenvwrapper envs',
      description: 'Virtual environments created by virtualenvwrapper.',
    },
    {
      path: '~/Library/Caches/pip',
      label: 'pip Cache',
      description: 'pip download cache.',
    },
  ],
};
