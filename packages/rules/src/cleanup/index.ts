import { SafetyRule } from '@sweep/types';
import { xcodeRules } from './xcode';
import { packageCacheRules } from './package-caches';
import { systemRules } from './system';
import { logRules } from './logs';
import { userDataRules } from './user-data';

export const ALL_SAFETY_RULES: SafetyRule[] = [
  ...xcodeRules,
  ...packageCacheRules,
  ...systemRules,
  ...logRules,
  ...userDataRules,
];

export * from './xcode';
export * from './package-caches';
export * from './system';
export * from './logs';
export * from './user-data';
