/**
 * STORY-auth-008: Unit tests for the forgot-password form component.
 *
 * Verifies:
 * - Renders email field and submit button
 * - Client-side email validation rules
 * - Submit to forgot-password API
 * - Confirmation message on success
 * - Server error display
 * - Loading state
 * - Accessible error alerts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { ForgotPasswordForm } from './ForgotPasswordForm';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mockFetch(response: { status: number; body: Record<string, unknown> }) {
  const mock = vi.fn().mockResolvedValue({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => response.body,
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/*  Rendering tests                                                    */
/* ------------------------------------------------------------------ */

describe('ForgotPasswordForm: Rendering', () => {
  it('renders email input field', () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('renders a link back to sign in', () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByText('Back to Sign In')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Client-side validation tests                                       */
/* ------------------------------------------------------------------ */

describe('ForgotPasswordForm: Client-side validation', () => {
  it('shows error for empty email on submit', async () => {
    render(<ForgotPasswordForm />);
    const submitBtn = screen.getByRole('button', { name: /send reset link/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/email must be a valid email address/i)).toBeInTheDocument();
    });
  });

  it('shows error for invalid email format', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    const submitBtn = screen.getByRole('button', { name: /send reset link/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/email must be a valid email address/i)).toBeInTheDocument();
    });
  });

  it('validates email on blur with invalid format', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('Email');
    await user.type(emailInput, 'bad-email');
    await user.tab(); // blur

    await waitFor(() => {
      expect(screen.getByText(/email must be a valid email address/i)).toBeInTheDocument();
    });
  });

  it('focuses email field when validation fails on submit', async () => {
    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('Email');
    const submitBtn = screen.getByRole('button', { name: /send reset link/i });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(emailInput).toHaveFocus();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Form submission tests                                              */
/* ------------------------------------------------------------------ */

describe('ForgotPasswordForm: Form submission', () => {
  it('submits to API on valid email', async () => {
    const mock = mockFetch({
      status: 200,
      body: { success: true, message: 'If an account exists...' },
    });

    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith('/api/v1/auth/forgot-password', expect.objectContaining({
        method: 'POST',
      }));
    });
  });

  it('shows confirmation message after successful submission', async () => {
    mockFetch({
      status: 200,
      body: { success: true, message: 'If an account exists...' },
    });

    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/if an account exists/i)).toBeInTheDocument();
  });

  it('displays server error on API failure', async () => {
    mockFetch({
      status: 500,
      body: { success: false, error: { message: 'An internal error occurred.' } },
    });

    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('An internal error occurred.');
    });
  });

  it('displays network error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error. Please check your connection and try again.');
    });
  });

  it('shows loading state and disables submit button during submission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          });
        }, 500);
      });
    }));

    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    const submitBtn = screen.getByRole('button', { name: /send reset link/i });
    await user.type(screen.getByLabelText('Email'), 'user@example.com');

    await user.click(submitBtn);

    await waitFor(() => {
      expect(submitBtn).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('calls onSubmitSuccess callback after successful submission', async () => {
    const mockOnSubmitSuccess = vi.fn();
    mockFetch({
      status: 200,
      body: { success: true },
    });

    const user = userEvent.setup();
    render(<ForgotPasswordForm onSubmitSuccess={mockOnSubmitSuccess} />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockOnSubmitSuccess).toHaveBeenCalledTimes(1);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Accessibility tests                                                */
/* ------------------------------------------------------------------ */

describe('ForgotPasswordForm: Accessibility', () => {
  it('error messages have role="alert"', async () => {
    render(<ForgotPasswordForm />);

    const submitBtn = screen.getByRole('button', { name: /send reset link/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  it('invalid fields have aria-invalid="true"', async () => {
    render(<ForgotPasswordForm />);

    const submitBtn = screen.getByRole('button', { name: /send reset link/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const emailInput = screen.getByLabelText('Email');
      expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('error message has matching aria-describedby on email input', async () => {
    render(<ForgotPasswordForm />);

    const submitBtn = screen.getByRole('button', { name: /send reset link/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const emailInput = screen.getByLabelText('Email');
      expect(emailInput).toHaveAttribute('aria-describedby', 'forgot-password-email-error');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Success state tests                                                */
/* ------------------------------------------------------------------ */

describe('ForgotPasswordForm: Success state', () => {
  it('renders confirmation banner after successful submission', async () => {
    mockFetch({
      status: 200,
      body: { success: true },
    });

    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      const banner = screen.getByTestId('forgot-password-success-banner');
      expect(banner).toBeVisible();
      expect(banner).toHaveAttribute('role', 'status');
    });
  });

  it('renders link to sign in after successful submission', async () => {
    mockFetch({
      status: 200,
      body: { success: true },
    });

    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText('Back to Sign In')).toBeInTheDocument();
    });
  });
});
