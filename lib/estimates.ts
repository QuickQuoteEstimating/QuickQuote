export const ESTIMATE_JOIN_ONLY_KEYS = [
  "customer_name",
  "customer_email",
  "customer_phone",
  "customer_address",
] as const;

type EstimateJoinOnlyKey = (typeof ESTIMATE_JOIN_ONLY_KEYS)[number];

type AnyEstimateRecord = Record<string, unknown> &
  Partial<Record<EstimateJoinOnlyKey, unknown>>;

export function sanitizeEstimateForQueue<T extends AnyEstimateRecord>(
  estimate: T
): Omit<T, EstimateJoinOnlyKey> {
  const sanitized: Record<string, unknown> = { ...estimate };

  for (const key of ESTIMATE_JOIN_ONLY_KEYS) {
    delete sanitized[key];
  }

  return sanitized as Omit<T, EstimateJoinOnlyKey>;
}

