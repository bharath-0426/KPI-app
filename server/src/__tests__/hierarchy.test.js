const path = require('path');
// Use an in-memory DB for tests — we need to initialize the schema
process.env.DB_PATH = ':memory:';

// The hierarchy module uses the shared db from schema.js
// We test the logic directly

describe('getVisibleEmployeeIds', () => {
  it('should be a function that can be imported', () => {
    // Minimal smoke test — just verify the module loads
    const { getVisibleEmployeeIds, getEmployeeWithRole } = require('../lib/hierarchy');
    expect(typeof getVisibleEmployeeIds).toBe('function');
    expect(typeof getEmployeeWithRole).toBe('function');
  });
});
