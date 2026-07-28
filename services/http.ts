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
