/**
 * STORY-auth-007: Unit tests for the login form component.
 *
 * Verifies:
 * - Client-side validation rules for email and password
 * - Password visibility toggle state
 * - Loading/disabled button state transitions
 * - Form submission to API
 * - Server error display for INVALID_CREDENTIALS and RATE_LIMIT_EXCEEDED
 * - Accessible error alerts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { LoginForm } from './LoginForm';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Mock the fetch API used by the login form.
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
 * Restore native fetch after each test.
 */
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/*  Rendering tests                                                    */
/* ------------------------------------------------------------------ */

describe('LoginForm: Rendering', () => {
  it('renders email and password input fields', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    render(<LoginForm />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders password visibility toggle button', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText('Show password')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Client-side validation tests                                       */
/* ------------------------------------------------------------------ */

describe('LoginForm: Client-side validation', () => {
  it('shows errors for all empty fields on submit', async () => {
    render(<LoginForm />);
    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/email must be a valid email address/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });

  it('shows error for invalid email format', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/email must be a valid email address/i)).toBeInTheDocument();
    });
  });

  it('shows error for empty password on submit', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('validates email on blur with invalid format', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const emailInput = screen.getByLabelText('Email');
    await user.type(emailInput, 'bad-email');
    await user.tab(); // blur away

    await waitFor(() => {
      expect(screen.getByText(/email must be a valid email address/i)).toBeInTheDocument();
    });
  });

  it('validates password on blur when empty', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const passwordInput = screen.getByLabelText('Password');
    // Focus then blur to trigger blur validation on empty password
    await user.click(passwordInput);
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Password visibility toggle tests                                   */
/* ------------------------------------------------------------------ */

describe('LoginForm: Password visibility toggle', () => {
  it('password input is masked by default', () => {
    render(<LoginForm />);
    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('toggles password between masked and unmasked', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const passwordInput = screen.getByLabelText('Password');
    const toggleButton = screen.getByLabelText('Show password');

    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Hide password')).toBeInTheDocument();

    await user.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Show password')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Form submission tests                                              */
/* ------------------------------------------------------------------ */

describe('LoginForm: Form submission', () => {
  it('submits to API on valid credentials', async () => {
    const mock = mockFetch({
      status: 200,
      body: { success: true, data: { id: '1', email: 'user@example.com' } },
    });

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({
        method: 'POST',
      }));
    });
  });

  it('displays INVALID_CREDENTIALS error from server', async () => {
    mockFetch({
      status: 401,
      body: { success: false, error: { message: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' } },
    });

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.');
    });
  });

  it('displays RATE_LIMIT_EXCEEDED error from server', async () => {
    mockFetch({
      status: 429,
      body: { success: false, error: { message: 'Too many failed login attempts. Please try again later.', code: 'RATE_LIMIT_EXCEEDED' } },
    });

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Too many failed login attempts. Please try again later.');
    });
  });

  it('displays network error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

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
            json: async () => ({ success: true, data: {} }),
          });
        }, 500);
      });
    }));

    const user = userEvent.setup();
    render(<LoginForm />);

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');

    await user.click(submitBtn);

    await waitFor(() => {
      expect(submitBtn).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('calls onSubmit callback with false after successful login (no guest migration)', async () => {
    const mock = mockFetch({
      status: 200,
      body: { success: true, data: { id: '1' } },
    });

    const mockOnSubmit = vi.fn();
    render(<LoginForm onSubmit={mockOnSubmit} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(false);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Focus management tests                                             */
/* ------------------------------------------------------------------ */

describe('LoginForm: Focus management (WCAG 2.1 AA)', () => {
  it('focuses email field when email is invalid on submit', async () => {
    render(<LoginForm />);

    const emailInput = screen.getByLabelText('Email');
    const submitBtn = screen.getByRole('button', { name: /sign in/i });

    // Don't fill email (empty), fill password
    await fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(emailInput).toHaveFocus();
    });
  });

  it('focuses password field when password is empty and email is valid', async () => {
    render(<LoginForm />);

    const passwordInput = screen.getByLabelText('Password');
    const submitBtn = screen.getByRole('button', { name: /sign in/i });

    await fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user@example.com' },
    });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(passwordInput).toHaveFocus();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Accessibility tests                                                */
/* ------------------------------------------------------------------ */

describe('LoginForm: Accessibility', () => {
  it('error messages have role="alert"', async () => {
    render(<LoginForm />);

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  it('invalid fields have aria-invalid="true"', async () => {
    render(<LoginForm />);

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const emailInput = screen.getByLabelText('Email');
      expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('error messages have matching aria-describedby on inputs', async () => {
    render(<LoginForm />);

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const emailInput = screen.getByLabelText('Email');
      expect(emailInput).toHaveAttribute('aria-describedby', 'login-email-error');
    });
  });
});
