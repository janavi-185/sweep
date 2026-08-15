#!/usr/bin/env node

import { getCoreVersion } from '@sweep/core';

export function runCli(): void {
  console.log(`Sweep CLI v${getCoreVersion()}`);
}

runCli();
