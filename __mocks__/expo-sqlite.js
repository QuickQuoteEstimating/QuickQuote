const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
};

module.exports = {
  openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
  __mockDb: mockDb,
};
