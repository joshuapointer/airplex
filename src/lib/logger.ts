import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'PLEX_TOKEN',
      'authorization',
      'cookie',
      'set-cookie',
      'x-plex-token',
      '*.PLEX_TOKEN',
      '*.authorization',
      '*.cookie',
      '*.set-cookie',
      '*.x-plex-token',
      'headers.authorization',
      'headers.cookie',
      'headers["set-cookie"]',
      'headers["x-plex-token"]',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
