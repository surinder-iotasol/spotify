/**
 * STORY-role-006: Unit tests for the email verification landing page.
 *
 * Verifies:
 * - Token extraction from URL query parameter
 * - API invocation to POST /api/v1/auth/verify-email/confirm on mount
 * - Loading state during verification
 * - Success state rendering with dashboard link on HTTP 200
 * - Error state rendering with resend button on token invalid/expired
 * - Resend button triggers POST /api/v1/auth/verify-email/request
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { useSearchParams, useRouter } from 'next/navigation';
import VerifyEmailPage from './page';

/* ------------------------------------------------------------------ */
/*  Next.js mock                                                       */
/* ------------------------------------------------------------------ */

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
  useRouter: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a mock fetch that returns a specific status and body.
 */
function mockFetch(response: { status: number; body: Record<string, unknown> }) {
  const mock = vi.fn().mockResolvedValue({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => response.body,
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/**
 * Mock a valid token in the URL query.
 */
function mockValidToken(token: string): void {
  vi.mocked(useSearchParams).mockReturnValue({
    get: (key: string) => (key === 'token' ? token : null),
    toString: () => `token=${token}`,
  } as unknown as URLSearchParams);
}

/**
 * Mock no token in the URL query.
 */
function mockNoToken(): void {
  vi.mocked(useSearchParams).mockReturnValue({
    get: () => null,
    toString: () => '',
  } as unknown as URLSearchParams);
}

/**
 * Mock a router push function.
 */
function mockRouterPush(target: string): void {
  const mockPush = vi.fn();
  vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<typeof useRouter>);
}

/**
 * Cleanup after each test.
 */
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/*  Token extraction tests                                             */
/* ------------------------------------------------------------------ */

describe('VerifyEmailPage: Token extraction', () => {
  it('reads token from URL query parameter on mount', () => {
    mockValidToken('abc123token');
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<typeof useRouter>);
    mockFetch({ status: 200, body: { success: true, data: { verified: true } } });

    render(<VerifyEmailPage />);
  });

  it('handles missing token gracefully', () => {
    mockNoToken();
    render(<VerifyEmailPage />);
  });
});

/* ------------------------------------------------------------------ */
/*  API invocation tests                                               */
/* ------------------------------------------------------------------ */

describe('VerifyEmailPage: API invocation on load', () => {
  it('calls verify-email/confirm endpoint with token on mount', async () => {
    mockValidToken('abc123token');
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<typeof useRouter>);
    const fetchMock = mockFetch({
      status: 200,
      body: { success: true, data: { verified: true, message: 'Email verified successfully.' } },
    });

    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/auth/verify-email/confirm',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'abc123token' }),
        }),
      );
    });
  });

  it('shows loading state while verification is in progress', async () => {
    mockValidToken('abc123token');
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<typeof useRouter>);

    // Never resolve the fetch to keep loading state
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    render(<VerifyEmailPage />);

    expect(screen.getByText(/verifying your email/i)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Success state tests                                                */
/* ------------------------------------------------------------------ */

describe('VerifyEmailPage: Success state', () => {
  it('renders success message when API returns 200', async () => {
    mockValidToken('abc123token');
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<typeof useRouter>);
    mockFetch({
      status: 200,
      body: { success: true, data: { verified: true, message: 'Email verified successfully.' } },
    });

    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(screen.getByText(/email verified successfully/i)).toBeInTheDocument();
    });
  });

  it('renders button to return to artist dashboard on success', async () => {
    mockValidToken('abc123token');
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<typeof useRouter>);
    mockFetch({
      status: 200,
      body: { success: true, data: { verified: true, message: 'Email verified successfully.' } },
    });

    render(<VerifyEmailPage />);

    await waitFor(() => {
      const dashboardBtn = screen.getByRole('button', { name: /go to dashboard/i });
      expect(dashboardBtn).toBeInTheDocument();
      // The button is wrapped in a Link (anchor), check the anchor's href
      const anchor = dashboardBtn.closest('a');
      expect(anchor).toHaveAttribute('href', '/upload');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Error state tests                                                  */
/* ------------------------------------------------------------------ */

describe('VerifyEmailPage: Error state', () => {
  it('renders error alert when token is invalid (400)', async () => {
    mockValidToken('invalidtoken');
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<typeof useRouter>);
    mockFetch({
      status: 400,
      body: {
        success: false,
        error: { code: 'INVALID_VERIFICATION_TOKEN', message: 'Verification token is invalid or has expired.' },
      },
    });

    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(screen.getByText(/verification failed/i)).toBeInTheDocument();
      expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument();
    });
  });

  it('renders resend button on error state', async () => {
    mockValidToken('invalidtoken');
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<typeof useRouter>);
    mockFetch({
      status: 400,
      body: {
        success: false,
        error: { code: 'INVALID_VERIFICATION_TOKEN', message: 'Verification token is invalid or has expired.' },
      },
    });

    render(<VerifyEmailPage />);

    await waitFor(() => {
      const resendBtn = screen.getByRole('button', { name: /resend verification email/i });
      expect(resendBtn).toBeInTheDocument();
    });
  });

  it('triggers resend on button click', async () => {
    mockValidToken('invalidtoken');
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<typeof useRouter>);

    // Initial failure
    mockFetch({
      status: 400,
      body: {
        success: false,
        error: { code: 'INVALID_VERIFICATION_TOKEN', message: 'Verification token is invalid or has expired.' },
      },
    });

    const user = userEvent.setup();
    render(<VerifyEmailPage />);

    // Click resend
    await waitFor(() => {
      const resendBtn = screen.getByRole('button', { name: /resend verification email/i });
      expect(resendBtn).toBeInTheDocument();
    });

    // Now mock a successful resend
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({ success: true, data: {} }),
    } as Response);

    const resendBtn = screen.getByRole('button', { name: /resend verification email/i });
    await user.click(resendBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/auth/verify-email/request',
        expect.any(Object),
      );
    });
  });
});
