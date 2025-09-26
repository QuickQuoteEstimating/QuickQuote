import { runSync } from "../sync";

type Change = {
  id: number;
  table_name: string;
  op: "insert" | "update" | "delete";
  payload: string;
  created_at: string;
};

jest.mock("../sqlite", () => ({
  getQueuedChanges: jest.fn(),
  clearQueuedChange: jest.fn(),
}));

jest.mock("../supabase", () => {
  const operations: any[] = [];
  const defaultInsert = async (payload: any) => ({ data: [payload], error: null });
  const defaultUpdate = async (payload: any) => ({ data: [payload], error: null });
  const defaultDelete = async () => ({ data: null, error: null });

  const insertBehavior = jest.fn(defaultInsert);
  const updateBehavior = jest.fn(defaultUpdate);
  const deleteBehavior = jest.fn(defaultDelete);

  const fromMock = jest.fn((table: string) => ({
    insert: async (payload: any) => {
      operations.push({ table, op: "insert", payload });
      return insertBehavior(payload, table);
    },
    update: (payload: any) => ({
      eq: async (column: string, value: any) => {
        operations.push({ table, op: "update", payload, column, value });
        return updateBehavior(payload, table);
      },
    }),
    delete: () => ({
      eq: async (column: string, value: any) => {
        operations.push({ table, op: "delete", column, value });
        return deleteBehavior({ column, value }, table);
      },
    }),
  }));

  return {
    supabase: {
      from: (table: string) => fromMock(table),
    },
    __supabaseMock: {
      getOperations: () => operations,
      reset: () => {
        operations.length = 0;
        fromMock.mockClear();
        insertBehavior.mockClear();
        insertBehavior.mockImplementation(defaultInsert);
        updateBehavior.mockClear();
        updateBehavior.mockImplementation(defaultUpdate);
        deleteBehavior.mockClear();
        deleteBehavior.mockImplementation(defaultDelete);
      },
      behaviors: {
        insert: insertBehavior,
        update: updateBehavior,
        delete: deleteBehavior,
      },
    },
  };
});

const sqliteModule = require("../sqlite") as {
  getQueuedChanges: jest.Mock;
  clearQueuedChange: jest.Mock;
};

const supabaseModule = require("../supabase") as {
  supabase: { from: jest.Mock };
  __supabaseMock: {
    getOperations: () => any[];
    reset: () => void;
    behaviors: {
      insert: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
};

describe("runSync", () => {
  const sqlite = sqliteModule;
  const supabaseHelpers = supabaseModule.__supabaseMock;

  beforeEach(() => {
    sqlite.getQueuedChanges.mockReset();
    sqlite.clearQueuedChange.mockReset();
    supabaseHelpers.reset();
  });

  it("processes queued inserts, updates, and deletes", async () => {
    const changes: Change[] = [
      {
        id: 1,
        table_name: "customers",
        op: "insert",
        payload: JSON.stringify({ id: "c1", name: "Test" }),
        created_at: new Date().toISOString(),
      },
      {
        id: 2,
        table_name: "estimates",
        op: "update",
        payload: JSON.stringify({ id: "e1", total: 42 }),
        created_at: new Date().toISOString(),
      },
      {
        id: 3,
        table_name: "photos",
        op: "delete",
        payload: JSON.stringify({ id: "p1" }),
        created_at: new Date().toISOString(),
      },
    ];

    sqlite.getQueuedChanges.mockResolvedValue(changes);

    await runSync();

    expect(sqlite.getQueuedChanges).toHaveBeenCalledTimes(1);
    expect(supabaseHelpers.getOperations()).toEqual([
      { table: "customers", op: "insert", payload: { id: "c1", name: "Test" } },
      {
        table: "estimates",
        op: "update",
        payload: { id: "e1", total: 42 },
        column: "id",
        value: "e1",
      },
      { table: "photos", op: "delete", column: "id", value: "p1" },
    ]);
    expect(sqlite.clearQueuedChange).toHaveBeenCalledTimes(3);
    expect(sqlite.clearQueuedChange).toHaveBeenNthCalledWith(1, 1);
    expect(sqlite.clearQueuedChange).toHaveBeenNthCalledWith(2, 2);
    expect(sqlite.clearQueuedChange).toHaveBeenNthCalledWith(3, 3);
  });

  it("leaves entries in the queue when Supabase returns an error", async () => {
    const changes: Change[] = [
      {
        id: 99,
        table_name: "customers",
        op: "insert",
        payload: JSON.stringify({ id: "c-err" }),
        created_at: new Date().toISOString(),
      },
    ];

    sqlite.getQueuedChanges.mockResolvedValue(changes);
    supabaseHelpers.behaviors.insert.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "boom" },
    }));

    await runSync();

    expect(sqlite.clearQueuedChange).not.toHaveBeenCalled();
  });
});
