export class PersistenceError extends Error {}

type PostgrestErrorLike = {
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

// PostgREST errors are plain objects, not Error instances. Keep the database
// diagnostics that distinguish a grant/RLS failure from a constraint failure.
// These fields do not contain a subscription endpoint, payload, or secret.
export const errorDetails = (error: unknown): Record<string, string | number> => {
  if (error instanceof Error) return { message: error.message.slice(0, 500) };
  if (!error || typeof error !== "object") return { message: "Unknown push delivery error" };
  const candidate = error as PostgrestErrorLike;
  const result: Record<string, string | number> = {};
  for (const key of ["code", "message", "details", "hint", "status", "statusCode"] as const) {
    const value = candidate[key];
    if (typeof value === "string") result[key] = value.slice(0, 500);
    if (typeof value === "number") result[key] = value;
  }
  return Object.keys(result).length ? result : { message: "Unknown push delivery error" };
};

export const errorText = (error: unknown) => errorDetails(error).message?.toString() ?? "Unknown push delivery error";

export async function persisted<T>(operation: PromiseLike<{ data: T; error: unknown }>, context: string): Promise<T> {
  const { data, error } = await operation;
  if (error) throw new PersistenceError(`${context}: ${errorText(error)}`);
  return data;
}

// Do not request a representation here. The dispatcher deliberately has INSERT,
// but no SELECT, on this private audit table.
export async function recordDeliveryAttempt(
  operation: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<void> {
  await persisted(operation, "Could not persist delivery attempt");
}
