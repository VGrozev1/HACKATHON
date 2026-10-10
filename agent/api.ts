async function callApi<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  // Read lazily, not at module load — importing this file never requires
  // APP_URL to already be set.
  const baseUrl = process.env.APP_URL;
  const url = `${baseUrl}${path}`;

  // fetch() itself throws on a connection failure (server not running,
  // wrong host, etc.) — separately from an HTTP error status below. Its
  // default message is just "fetch failed", which says nothing useful, so
  // pull the real reason out of err.cause.
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (err) {
    const code =
      err instanceof Error && err.cause && typeof err.cause === "object" && "code" in err.cause
        ? ` (${(err.cause as { code: string }).code})`
        : "";
    throw new Error(`Could not reach Todor's API at ${url}${code} — is the server running?`);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // No JSON body (e.g. a 204, or the server didn't respond with JSON) —
    // leave body as null rather than letting a parse error mask the real
    // problem below.
  }

  if (!response.ok) {
    const message =
      (body as { error?: string } | null)?.error ?? response.statusText ?? "request failed";
    throw new Error(`Todor's API error calling ${path}: ${response.status} ${message}`);
  }

  return body as T;
}

export function apiGet<T = unknown>(path: string): Promise<T> {
  return callApi<T>(path);
}

export function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  return callApi<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
