import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// React Testing Library's own auto-cleanup only registers when it detects
// a global `afterEach` (e.g. under `test.globals: true`); this project
// keeps globals off and imports test functions explicitly instead, so
// cleanup is wired up here rather than left to RTL's detection.
afterEach(cleanup);
