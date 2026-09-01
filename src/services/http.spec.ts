import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch, ApiError } from './http';

// Every other spec in this codebase mocks services/auth.ts rather than
// exercising its real localStorage-backed getToken() — following that
// convention here too, since jsdom's localStorage isn't available under
// this project's vitest environment.
vi.mock('./auth', () => ({ getToken: () => null }));

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('returns the parsed JSON body on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { id: '1' })));

    const result = await apiFetch<{ id: string }>('/rooms', { fallbackMessage: 'Failed to fetch rooms' });

    expect(result).toEqual({ id: '1' });
  });

  it('throws ApiError with the server-provided message and status on a non-ok JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(409, { message: 'Conflict!' })));

    await expect(
      apiFetch('/bookings', { method: 'POST', fallbackMessage: 'Failed to create booking' }),
    ).rejects.toMatchObject({ message: 'Conflict!', status: 409 });
  });

  it('falls back to fallbackMessage when the error response has no message field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, {})));

    await expect(
      apiFetch('/rooms', { fallbackMessage: 'Failed to fetch rooms' }),
    ).rejects.toMatchObject({ message: 'Failed to fetch rooms', status: 500 });
  });

  it('falls back to fallbackMessage when the error response body is not JSON', async () => {
    const res = {
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));

    await expect(
      apiFetch('/rooms', { fallbackMessage: 'Failed to fetch rooms' }),
    ).rejects.toMatchObject({ message: 'Failed to fetch rooms', status: 500 });
  });

  it('is an instance of ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {})));

    await expect(apiFetch('/rooms', { fallbackMessage: 'nope' })).rejects.toBeInstanceOf(ApiError);
  });

  it('returns undefined without parsing the response body when parseJson is false', async () => {
    const json = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204, json } as unknown as Response));

    const result = await apiFetch('/bookings/1', { method: 'DELETE', parseJson: false, fallbackMessage: 'Failed to delete booking' });

    expect(result).toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it('sets Content-Type: application/json when json is true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/bookings', {
      method: 'POST',
      json: true,
      body: JSON.stringify({ title: 'x' }),
      fallbackMessage: 'Failed to create booking',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('omits Content-Type when json is not set (e.g. FormData bodies)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/repairs', { method: 'POST', body: new FormData(), fallbackMessage: 'Failed to submit' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('requests against API_BASE_URL + path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/rooms', { fallbackMessage: 'Failed to fetch rooms' });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3001/api/rooms');
  });
});
