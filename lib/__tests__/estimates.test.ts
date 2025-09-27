import { sanitizeEstimateForQueue, ESTIMATE_JOIN_ONLY_KEYS } from "../estimates";

describe("sanitizeEstimateForQueue", () => {
  it("removes join-only customer columns before queueing", () => {
    const estimate = {
      id: "estimate-1",
      user_id: "user-1",
      customer_id: "customer-1",
      customer_name: "Jane Doe",
      customer_email: "jane@example.com",
      customer_phone: "555-1234",
      customer_address: "123 Main St",
      date: "2024-01-01T00:00:00.000Z",
      total: 1500,
      notes: "Test estimate",
      status: "draft",
      version: 3,
      updated_at: "2024-01-02T00:00:00.000Z",
      deleted_at: null,
    };

    const sanitized = sanitizeEstimateForQueue(estimate);

    for (const joinKey of ESTIMATE_JOIN_ONLY_KEYS) {
      expect(sanitized).not.toHaveProperty(joinKey);
    }

    expect(sanitized).toMatchObject({
      id: "estimate-1",
      user_id: "user-1",
      customer_id: "customer-1",
      date: "2024-01-01T00:00:00.000Z",
      total: 1500,
      notes: "Test estimate",
      status: "draft",
      version: 3,
      updated_at: "2024-01-02T00:00:00.000Z",
      deleted_at: null,
    });

    // Ensure the original object is not mutated in case callers reuse it.
    for (const joinKey of ESTIMATE_JOIN_ONLY_KEYS) {
      expect(estimate).toHaveProperty(joinKey);
    }
  });
});
