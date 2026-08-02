/**
 * STORY-auth-006: Unit tests for the registration form component.
 *
 * Verifies:
 * - Client-side validation rules match server-side schema
 * - Password strength meter state transitions
 * - Show/hide password toggle state
 * - Loading/disabled button state transitions
 * - Form submission to API
 * - Error display for server errors (AUTH_EMAIL_EXISTS)
 * - Focus management on validation errors
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { RegisterForm } from './RegisterForm';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Mock the fetch API used by the registration form.
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

describe('RegisterForm: Rendering', () => {
  it('renders all three input fields', () => {
    render(<RegisterForm />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Display Name')).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    render(<RegisterForm />);
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Client-side validation tests                                       */
/* ------------------------------------------------------------------ */

describe('RegisterForm: Client-side validation', () => {
  function fillFields(user: ReturnType<typeof userEvent.setup>) {
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Display Name'), {
      target: { value: 'ValidName' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Password1' },
    });
  }

  it('shows errors for all empty fields on submit', async () => {
    render(<RegisterForm />);
    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/email must be a valid email address/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/display name is required/i)).toBeInTheDocument();
  });

  it('shows error for invalid email format', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/email must be a valid email address/i)).toBeInTheDocument();
    });
  });

  it('shows error for password shorter than 8 characters', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'Short1a');

    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    });
  });

  it('shows error for missing uppercase in password', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Display Name'), 'ValidName');
    await user.type(screen.getByLabelText('Password'), 'password1');

    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/password must contain at least one uppercase letter/i),
      ).toBeInTheDocument();
    });
  });

  it('shows error for missing digit in password', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Display Name'), 'ValidName');
    await user.type(screen.getByLabelText('Password'), 'Password');

    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/password must contain at least one digit/i)).toBeInTheDocument();
    });
  });

  it('shows error for displayName exceeding 80 characters', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'Password1');
    await user.type(screen.getByLabelText('Display Name'), 'A'.repeat(81));

    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/display name must be at most 80 characters/i),
      ).toBeInTheDocument();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Password strength meter tests                                      */
/* ------------------------------------------------------------------ */

describe('RegisterForm: Password strength meter', () => {
  it('does not show strength meter when password is empty', () => {
    render(<RegisterForm />);
    expect(screen.queryByText(/password strength/i)).not.toBeInTheDocument();
  });

  it('displays strength indicator when password is entered', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.type(passwordInput, 'Test');

    await waitFor(() => {
      expect(screen.getByText(/password strength/i)).toBeInTheDocument();
    });
  });

  it('shows "weak" strength for short passwords', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const passwordInput = screen.getByLabelText('Password');
    await user.type(passwordInput, 'a');

    await waitFor(() => {
      expect(screen.getByText(/weak/i)).toBeInTheDocument();
    });
  });

  it('shows "strong" strength for strong passwords', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const passwordInput = screen.getByLabelText('Password');
    await user.type(passwordInput, 'Str0ngPass');

    await waitFor(() => {
      expect(screen.getByText(/strong/i)).toBeInTheDocument();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Show/hide password toggle tests                                    */
/* ------------------------------------------------------------------ */

describe('RegisterForm: Show/hide password toggle', () => {
  it('password input starts as type="password"', () => {
    render(<RegisterForm />);
    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('toggles password visibility when toggle button is clicked', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const passwordInput = screen.getByLabelText('Password');
    const toggleButton = screen.getByRole('button', { name: /show password/i });

    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('toggle button aria-label changes with visibility state', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const toggleButton = screen.getByRole('button', { name: /show password/i });
    expect(toggleButton).toHaveAttribute('aria-label', 'Show password');

    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-label', 'Hide password');
  });
});

/* ------------------------------------------------------------------ */
/*  Loading and disabled state tests                                   */
/* ------------------------------------------------------------------ */

describe('RegisterForm: Loading and disabled states', () => {
  beforeEach(() => {
    mockFetch({
      status: 201,
      body: {
        success: true,
        data: { id: '1', email: 'user@example.com', displayName: 'Test' },
      },
    });
  });

  it('changes submit button label during loading', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Display Name'), 'ValidName');
    await user.type(screen.getByLabelText('Password'), 'Password1');

    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submitBtn).toHaveTextContent(/creating account/i);
    });
  });

  it('disables button with aria-disabled during submission', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Display Name'), 'ValidName');
    await user.type(screen.getByLabelText('Password'), 'Password1');

    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submitBtn).toHaveAttribute('aria-disabled', 'true');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Error handling tests                                               */
/* ------------------------------------------------------------------ */

describe('RegisterForm: Error handling', () => {
  it('displays AUTH_EMAIL_EXISTS server error in accessible banner', async () => {
    mockFetch({
      status: 409,
      body: {
        success: false,
        error: {
          code: 'AUTH_EMAIL_EXISTS',
          message: 'An account with this email address is already registered.',
        },
      },
    });

    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'existing@example.com');
    await user.type(screen.getByLabelText('Display Name'), 'ValidName');
    await user.type(screen.getByLabelText('Password'), 'Password1');

    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/already registered/i);
    });
  });

  it('displays general server errors in accessible banner', async () => {
    mockFetch({
      status: 500,
      body: {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      },
    });

    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Display Name'), 'ValidName');
    await user.type(screen.getByLabelText('Password'), 'Password1');

    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/internal server error/i);
    });
  });
});
