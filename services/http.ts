import { getToken } from './auth';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
