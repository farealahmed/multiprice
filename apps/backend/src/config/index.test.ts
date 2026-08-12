import { describe, expect, it } from 'vitest';
import { buildConfig, InvalidConfigError } from './index.ts';

const validEnv: NodeJS.ProcessEnv = {
  MONGO_URL: 'mongodb://localhost:27017',
  MONGO_DB: 'multiprice_test',
  JWT_SECRET: 'a-secret-that-is-not-empty',
};

const modes = ['development', 'test', 'production'] as const;

describe('buildConfig — JWT_SECRET', () => {
  it('accepts a non-empty secret', () => {
    expect(buildConfig(validEnv).JWT_SECRET).toBe(validEnv.JWT_SECRET);
  });

  it.each(modes)('rejects an empty secret in %s', (NODE_ENV) => {
    expect(() => buildConfig({ ...validEnv, NODE_ENV, JWT_SECRET: '' })).toThrow(
      InvalidConfigError,
    );
  });

  it.each(modes)('rejects a missing secret in %s', (NODE_ENV) => {
    const { JWT_SECRET: _secret, ...envWithoutSecret } = validEnv;

    expect(() => buildConfig({ ...envWithoutSecret, NODE_ENV })).toThrow(
      InvalidConfigError,
    );
  });

  it('keeps the COOKIE_NAME default', () => {
    expect(buildConfig(validEnv).COOKIE_NAME).toBe('mp_session');
  });
});
