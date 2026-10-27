// Test environment: provide the secrets the app reads at import time and keep
// logging quiet. No real database is used — prisma is mocked per test file.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'test-default-pass';
process.env.LOG_LEVEL = 'silent';
