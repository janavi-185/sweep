import { DevToolDefinition } from './types';

export const rust: DevToolDefinition = {
  id: 'rust',
  name: 'Rust / Cargo',
  description: 'Cargo registry and compiled crate cache',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.cargo/registry',
      label: 'Cargo Registry',
      description: 'Downloaded crate sources and compiled crates.',
    },
    {
      path: '~/.cargo/git',
      label: 'Cargo Git Cache',
      description: 'Crates fetched directly from git repositories.',
    },
  ],
};
