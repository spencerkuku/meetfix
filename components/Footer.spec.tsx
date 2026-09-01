import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from './Footer';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Footer — school name from VITE_SCHOOL_NAME', () => {
  it('includes the configured school name when VITE_SCHOOL_NAME is set', () => {
    vi.stubEnv('VITE_SCHOOL_NAME', '嘉義高工');
    render(<Footer />);

    expect(screen.getByText(/嘉義高工 會議與報修系統/)).toBeInTheDocument();
  });

  it('omits the school name segment entirely when VITE_SCHOOL_NAME is unset', () => {
    vi.stubEnv('VITE_SCHOOL_NAME', '');
    render(<Footer />);

    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toMatch(/© \d{4} 會議與報修系統/);
    expect(footer.textContent).not.toMatch(/ {2}會議與報修系統/);
  });
});
