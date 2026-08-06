import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// React Testing Library's own auto-cleanup only registers when it detects
// a global `afterEach` (e.g. under `test.globals: true`); this project
// keeps globals off and imports test functions explicitly instead, so
// cleanup is wired up here rather than left to RTL's detection.
afterEach(cleanup);

// jsdom doesn't implement ResizeObserver; components that measure elements
// with it (e.g. BookingCalendarGrid's sticky header height tracking) need
// at least a no-op stand-in to mount under jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
