/** Browser-side JSON API client with consistent error messages (Italian, from the server). */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  /** Redirect to /login on 401 (default true) */
  redirectOn401?: boolean;
}

export async function api<T = unknown>(url: string, options: ApiOptions = {}): Promise<T> {
  const hasBody = options.body !== undefined || options.formData !== undefined;
  const res = await fetch(url, {
    method: options.method ?? (hasBody ? "POST" : "GET"),
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    signal: options.signal,
    credentials: "same-origin",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && options.redirectOn401 !== false && typeof window !== "undefined") {
      // Full reload on purpose: the session is gone, discard all client state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    const payload = (data ?? {}) as { error?: string; issues?: { path: string; message: string }[] };
    const issues = payload.issues ?? [];
    const base = payload.error ?? `Errore ${res.status}`;
    const message = issues.length ? `${base} ${issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ")}` : base;
    throw new ApiError(message, res.status, issues);
  }
  return data as T;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Si è verificato un errore.";
}
