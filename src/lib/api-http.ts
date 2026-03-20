export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Parse JSON from an API route; throws `ApiError` when `!res.ok`. */
export async function readApiJson<T extends Record<string, unknown>>(res: Response): Promise<T> {
  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!res.ok) {
    throw new ApiError(
      String(body.error ?? "Request failed"),
      res.status,
      typeof body.code === "string" ? body.code : undefined,
    );
  }
  return body as T;
}
