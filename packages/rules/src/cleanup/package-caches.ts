import { SafetyRule, FileCategory } from '@sweep/types';

export const npmCache: SafetyRule = {
  id: 'npm-cache',
  name: 'npm Package Cache',
  description: 'Global npm package download cache.',
  whySafeToRemove:
    'npm caches tarballs of packages downloaded from the registry. Package managers redownload missing packages when installing.',
  category: FileCategory.Cache,
  requiresConfirmation: true,
  paths: ['~/.npm/**'],
};

export const pnpmStore: SafetyRule = {
  id: 'pnpm-store',
  name: 'pnpm Package Store',
  description: 'Global pnpm package store.',
  whySafeToRemove:
    'pnpm package store caches shared package files. Unused packages can be safely purged.',
  category: FileCategory.Cache,
  requiresConfirmation: true,
  paths: ['~/.pnpm-store/**', '~/Library/pnpm/store/**'],
};

export const yarnCache: SafetyRule = {
  id: 'yarn-cache',
  name: 'Yarn Package Cache',
  description: 'Global Yarn package cache.',
  whySafeToRemove:
    'Yarn caches downloaded package archives to speed up offline installs. Missing packages will be fetched on next install.',
  category: FileCategory.Cache,
  requiresConfirmation: true,
  paths: ['~/.yarn/cache/**', '~/Library/Caches/yarn/**'],
};

export const gradleCache: SafetyRule = {
  id: 'gradle-cache',
  name: 'Gradle Dependency Cache',
  description: 'Downloaded Gradle dependencies and build caches.',
  whySafeToRemove: 'Gradle redownloads required dependencies automatically during your next build.',
  category: FileCategory.Cache,
  requiresConfirmation: true,
  paths: ['~/.gradle/caches/**'],
};

export const cargoCache: SafetyRule = {
  id: 'cargo-cache',
  name: 'Cargo Registry Cache',
  description: 'Rust Cargo crate registry and download cache.',
  whySafeToRemove: 'Cargo fetches missing crate sources automatically when building Rust projects.',
  category: FileCategory.Cache,
  requiresConfirmation: true,
  paths: ['~/.cargo/registry/**', '~/.cargo/git/**'],
};

export const mavenCache: SafetyRule = {
  id: 'maven-cache',
  name: 'Maven Local Repository',
  description: 'Downloaded Maven JAR artifacts in ~/.m2.',
  whySafeToRemove:
    'Maven redownloads required artifacts from central repositories on the next build.',
  category: FileCategory.Cache,
  requiresConfirmation: true,
  paths: ['~/.m2/repository/**'],
};

export const pipCache: SafetyRule = {
  id: 'pip-cache',
  name: 'pip Download Cache',
  description: 'Python pip package download cache.',
  whySafeToRemove:
    'pip caches wheel files for fast re-installs. Removing pip cache does not affect installed Python virtualenvs.',
  category: FileCategory.Cache,
  requiresConfirmation: true,
  paths: ['~/Library/Caches/pip/**'],
};

export const pubCache: SafetyRule = {
  id: 'pub-cache',
  name: 'Flutter & Dart Pub Cache',
  description: 'Downloaded Dart & Flutter packages.',
  whySafeToRemove: 'Dart pub fetches required packages when running `flutter pub get`.',
  category: FileCategory.Cache,
  requiresConfirmation: true,
  paths: ['~/.pub-cache/**', '~/Library/Caches/Dart/**'],
};

export const packageCacheRules: SafetyRule[] = [
  npmCache,
  pnpmStore,
  yarnCache,
  gradleCache,
  cargoCache,
  mavenCache,
  pipCache,
  pubCache,
];
