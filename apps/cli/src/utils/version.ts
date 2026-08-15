import packageJson from '../../package.json' assert { type: 'json' };

export const CLI_VERSION = packageJson.version || '0.1.0';
