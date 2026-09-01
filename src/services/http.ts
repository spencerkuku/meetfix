import { getToken } from './auth';

// The API's origin — empty string means same-origin (e.g. the docker/Caddy
// deployment, where the frontend and API are served from the same origin).
// Nullish coalescing (not ||) is required so an explicitly empty
// VITE_API_URL isn't overridden by the localhost fallback.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// Every API endpoint lives under this shared prefix (see the backend's
// src/bootstrap.ts). Image paths returned by the API (e.g. room/repair
// photos) already include it, so only endpoint calls need it added here.
export const API_BASE_URL = `${API_URL}/api`;

// `json: true` adds a Content-Type header for JSON request bodies — omit it
// for multipart/form-data requests, where the browser sets the header
// (including the multipart boundary) itself.
export function authHeaders(json = false): Record<string, string> {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

// Thrown by apiFetch on any non-ok response. `status` lets a caller
// special-case a particular HTTP status (e.g. 409 Conflict) into a more
// specific, domain-named error class without apiFetch itself needing to
// know which statuses are meaningful to which endpoint.
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export interface ApiFetchOptions {
  method?: string;
  body?: BodyInit;
  // Body is JSON — adds Content-Type via authHeaders. Omit for FormData
  // bodies, where the browser sets its own Content-Type (multipart boundary).
  json?: boolean;
  // Parse and return the response body as JSON. Set false for endpoints
  // that return no body (deletes, and some PATCH actions that don't return
  // the updated resource) — otherwise apiFetch's `res.json()` call would
  // fail against an empty response.
  parseJson?: boolean;
  // Used when the error response isn't JSON, or has no `message` field.
  fallbackMessage: string;
}

// The frontend's single request seam for the ~32 "regular" JSON/FormData
// API calls: makes the request, throws a typed ApiError on a non-ok
// response (preferring the server's own `message` field over
// fallbackMessage), and otherwise returns the parsed JSON body. Endpoints
// with categorically different response shapes (services/auth.ts's
// token-acquisition calls, services/repairs.ts's blob-returning CSV
// export) call fetch directly instead — see their own files for why.
export async function apiFetch<T = void>(
  path: string,
  options: ApiFetchOptions,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method,
    headers: authHeaders(options.json),
    body: options.body,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(body?.message ?? options.fallbackMessage, res.status);
  }
  if (options.parseJson === false) return undefined as T;
  return res.json() as Promise<T>;
}
