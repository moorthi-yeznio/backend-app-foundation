const fallbackEnv: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  API_PREFIX: 'api',
  API_VERSION: 'v1',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
  JWT_SECRET: 'test-jwt-secret-minimum-32-characters-long',
  JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-chars',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  CORS_ORIGINS: 'http://localhost:3000',
  LOG_LEVEL: 'error',
  THROTTLE_TTL: '60000',
  THROTTLE_LIMIT: '100',
};

for (const [key, value] of Object.entries(fallbackEnv)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
