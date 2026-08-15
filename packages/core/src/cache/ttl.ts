const TTL_RULES: Array<{ pattern: RegExp; ttl: number }> = [
  { pattern: /DerivedData|com\.docker|Docker\.raw/i, ttl: 900 }, // 15 min
  { pattern: /node_modules|\.npm|\.pnpm-store|\.yarn/i, ttl: 7200 }, // 2 hr
];

export function getTtl(targetPath: string): number {
  for (const rule of TTL_RULES) {
    if (rule.pattern.test(targetPath)) {
      return rule.ttl;
    }
  }
  return 3600; // Default: 1 hr
}
