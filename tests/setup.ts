// Global Jest setup — runs after the test framework is installed in each file.

// Clear globalThis caches between tests to prevent cross-test pollution.
beforeEach(() => {
  const g = globalThis as Record<string, unknown>;
  g["_configCache"] = null;
  g["_rbacCache"] = undefined;
});

// Ensure JWT_SECRET is set for tests that exercise auth functions.
process.env.JWT_SECRET = "test-secret-for-jest-do-not-use-in-production";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/dvj_erp_test";
