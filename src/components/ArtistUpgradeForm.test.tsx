/**
 * STORY-role-005: Unit tests for the ArtistUpgradeForm component.
 *
 * Verifies:
 * - Rendering of all form fields (stageName, bio, genreTags)
 * - Client-side validation for stageName, bio, and genreTags
 * - Genre tag selection behavior
 * - Form submission to API endpoint
 * - Server error display for API failures
 * - Accessibility attributes (aria-invalid, aria-describedby, role="alert")
 * - Loading state transitions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { ArtistUpgradeForm } from './ArtistUpgradeForm';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Mock the fetch API used by the artist upgrade form.
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

describe('ArtistUpgradeForm: Rendering', () => {
  it('renders stage name input field', () => {
    render(<ArtistUpgradeForm />);
    expect(screen.getByLabelText('Stage Name')).toBeInTheDocument();
  });

  it('renders bio textarea', () => {
    render(<ArtistUpgradeForm />);
    expect(screen.getByLabelText('Bio')).toBeInTheDocument();
  });

  it('renders genre tags select', () => {
    render(<ArtistUpgradeForm />);
    expect(screen.getByLabelText(/Genre Tags/i)).toBeInTheDocument();
  });

  it('renders submit button', () => {
    render(<ArtistUpgradeForm />);
    expect(screen.getByRole('button', { name: /upgrade to artist/i })).toBeInTheDocument();
  });

  it('renders genre options in select', () => {
    render(<ArtistUpgradeForm />);
    const select = screen.getByLabelText(/Genre Tags/i);
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect((select as HTMLSelectElement).multiple).toBe(true);
    const options = (select as HTMLSelectElement).options;
    expect(options.length).toBeGreaterThan(0);
    // Check that some known genres exist
    const optionValues = Array.from(options).map((o) => o.value);
    expect(optionValues).toContain('INDIE_ROCK');
    expect(optionValues).toContain('ELECTRONIC');
    expect(optionValues).toContain('HIP_HOP');
  });
});

/* ------------------------------------------------------------------ */
/*  Client-side validation tests                                       */
/* ------------------------------------------------------------------ */

describe('ArtistUpgradeForm: Stage name validation', () => {
  it('shows error for empty stage name on submit', async () => {
    render(<ArtistUpgradeForm />);
    const submitBtn = screen.getByRole('button', { name: /upgrade to artist/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/stage name is required/i)).toBeInTheDocument();
    });
  });

  it('shows error for stage name exceeding 50 characters', async () => {
    const user = userEvent.setup();
    render(<ArtistUpgradeForm />);

    const stageNameInput = screen.getByLabelText('Stage Name');
    await user.type(stageNameInput, 'a'.repeat(51));

    const submitBtn = screen.getByRole('button', { name: /upgrade to artist/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/stage name must be between 1 and 50 characters/i)).toBeInTheDocument();
    });
  });

  it('validates stage name on blur with empty value', async () => {
    const user = userEvent.setup();
    render(<ArtistUpgradeForm />);

    const stageNameInput = screen.getByLabelText('Stage Name');
    await user.click(stageNameInput);
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/stage name is required/i)).toBeInTheDocument();
    });
  });

  it('validates stage name on blur with valid value', async () => {
    const user = userEvent.setup();
    render(<ArtistUpgradeForm />);

    const stageNameInput = screen.getByLabelText('Stage Name');
    await user.type(stageNameInput, 'MyStage');
    await user.tab();

    await waitFor(() => {
      expect(screen.queryByText(/stage name is required/i)).not.toBeInTheDocument();
    });
  });
});

describe('ArtistUpgradeForm: Bio validation', () => {
  it('shows error for bio exceeding 500 characters', async () => {
    render(<ArtistUpgradeForm />);

    const bioTextarea = screen.getByLabelText('Bio');
    // Use fireEvent.change to set value beyond maxLength (bypasses HTML maxLength)
    fireEvent.change(bioTextarea, { target: { value: 'b'.repeat(501) } });

    // Trigger blur to fire validation
    fireEvent.blur(bioTextarea);

    await waitFor(() => {
      expect(screen.getByText(/bio must be 500 characters or fewer/i)).toBeInTheDocument();
    });
  });

  it('shows character counter for bio', () => {
    render(<ArtistUpgradeForm />);
    const bioTextarea = screen.getByLabelText('Bio');
    // Initially should show 0/500
    expect(screen.getByText(/0\/500/i)).toBeInTheDocument();
  });

  it('updates character counter as user types', async () => {
    const user = userEvent.setup();
    render(<ArtistUpgradeForm />);

    const bioTextarea = screen.getByLabelText('Bio');
    await user.type(bioTextarea, 'hello');

    await waitFor(() => {
      expect(screen.getByText(/5\/500/i)).toBeInTheDocument();
    });
  });

  it('validates bio on blur with exceeding value', async () => {
    render(<ArtistUpgradeForm />);

    const bioTextarea = screen.getByLabelText('Bio');
    // Use fireEvent.change to bypass maxLength HTML attribute
    fireEvent.change(bioTextarea, { target: { value: 'c'.repeat(501) } });
    fireEvent.blur(bioTextarea);

    await waitFor(() => {
      expect(screen.getByText(/bio must be 500 characters or fewer/i)).toBeInTheDocument();
    });
  });
});

describe('ArtistUpgradeForm: Genre tags validation', () => {
  it('shows error when no genre tags selected on submit', async () => {
    render(<ArtistUpgradeForm />);

    // Fill other fields so validation focuses on genre
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Stage Name'), 'MyStage');
    await user.tab();
    await user.click(screen.getByRole('button', { name: /upgrade to artist/i }));

    await waitFor(() => {
      expect(screen.getByText(/select at least 1 genre tag/i)).toBeInTheDocument();
    });
  });

  it('shows error when too many genre tags selected (more than 5)', async () => {
    const user = userEvent.setup();
    render(<ArtistUpgradeForm />);

    const stageNameInput = screen.getByLabelText('Stage Name');
    await user.type(stageNameInput, 'MyStage');
    await user.tab();

    // Manually set 6 genres in state by selecting options
    const genreSelect = screen.getByLabelText(/Genre Tags/i);
    const options = Array.from(genreSelect.querySelectorAll('option'));

    // Select first 6 options
    for (let i = 0; i < 6; i++) {
      options[i].selected = true;
    }

    fireEvent.change(genreSelect);

    const submitBtn = screen.getByRole('button', { name: /upgrade to artist/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/select at most 5 genre tags/i)).toBeInTheDocument();
    });
  });

  it('updates genre tag count in label when selecting', async () => {
    const user = userEvent.setup();
    render(<ArtistUpgradeForm />);

    const stageNameInput = screen.getByLabelText('Stage Name');
    await user.type(stageNameInput, 'MyStage');
    await user.tab();

    const genreSelect = screen.getByLabelText(/Genre Tags/i) as HTMLSelectElement;
    genreSelect.querySelectorAll('option')[0].selected = true;
    fireEvent.change(genreSelect);

    await waitFor(() => {
      expect(screen.getByText(/Genre Tags \(1\/5\)/i)).toBeInTheDocument();
    });
  });
});

describe('ArtistUpgradeForm: Accessibility attributes', () => {
  it('stage name input has aria-invalid when validation fails', async () => {
    render(<ArtistUpgradeForm />);
    const submitBtn = screen.getByRole('button', { name: /upgrade to artist/i });
    fireEvent.click(submitBtn);

    const stageNameInput = screen.getByLabelText('Stage Name');
    expect(stageNameInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('stage name input has aria-describedby pointing to error message', async () => {
    render(<ArtistUpgradeForm />);
    const submitBtn = screen.getByRole('button', { name: /upgrade to artist/i });
    fireEvent.click(submitBtn);

    const stageNameInput = screen.getByLabelText('Stage Name');
    expect(stageNameInput).toHaveAttribute('aria-describedby', 'artist-stage-name-error');
  });

  it('error messages have role="alert"', async () => {
    render(<ArtistUpgradeForm />);
    const submitBtn = screen.getByRole('button', { name: /upgrade to artist/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const errorMessages = screen.queryAllByRole('alert');
      const stageError = errorMessages.find((el) =>
        el.id === 'artist-stage-name-error' || el.textContent?.includes('stage name'),
      );
      expect(stageError).toBeInTheDocument();
    });
  });

  it('bio textarea has aria-describedby', async () => {
    render(<ArtistUpgradeForm />);
    const bioTextarea = screen.getByLabelText('Bio');
    expect(bioTextarea).toHaveAttribute('aria-describedby', 'artist-bio-hint');
  });
});

/* ------------------------------------------------------------------ */
/*  Form submission tests                                              */
/* ------------------------------------------------------------------ */

describe('ArtistUpgradeForm: Form submission', () => {
  it('submits to API endpoint on valid form', async () => {
    const mock = mockFetch({
      status: 200,
      body: {
        success: true,
        data: {
          user: { id: '1', roles: ['LISTENER', 'ARTIST'] },
          artistProfile: { id: '1', stageName: 'MyStage' },
        },
      },
    });

    const user = userEvent.setup();
    render(<ArtistUpgradeForm />);

    await user.type(screen.getByLabelText('Stage Name'), 'MyStage');
    await user.tab();

    // Select genre: need to select options manually
    const genreSelect = screen.getByLabelText(/Genre Tags/i) as HTMLSelectElement;
    genreSelect.querySelectorAll('option')[0].selected = true;
    fireEvent.change(genreSelect);

    await user.click(screen.getByRole('button', { name: /upgrade to artist/i }));

    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith(
        '/api/v1/users/me/upgrade-to-artist',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('MyStage'),
        }),
      );
    });
  });

  it('submits correct payload to API', async () => {
    const mock = mockFetch({
      status: 200,
      body: { success: true, data: { user: {}, artistProfile: {} } },
    });

    const user = userEvent.setup();
    render(<ArtistUpgradeForm />);

    await user.type(screen.getByLabelText('Stage Name'), 'PerfArtist');
    await user.tab();

    const bioTextarea = screen.getByLabelText('Bio');
    await user.type(bioTextarea, 'A bio about me');
    await user.tab();

    const genreSelect = screen.getByLabelText(/Genre Tags/i) as HTMLSelectElement;
    genreSelect.querySelectorAll('option')[0].selected = true;
    genreSelect.querySelectorAll('option')[1].selected = true;
    fireEvent.change(genreSelect);

    await user.click(screen.getByRole('button', { name: /upgrade to artist/i }));

    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith(
        '/api/v1/users/me/upgrade-to-artist',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringMatching(/"stageName":"PerfArtist"/),
        }),
      );
      // Verify genreTags are sent as an array
      const callArg = mock.mock.calls[0][1] as Record<string, unknown>;
      const bodyParsed = JSON.parse(callArg.body as string);
      expect(bodyParsed.genreTags).toEqual(['INDIE_ROCK', 'BEDROOM_POP']);
      expect(bodyParsed.stageName).toBe('PerfArtist');
      expect(bodyParsed.bio).toBe('A bio about me');
    });
  });

  it('displays server error on API failure', async () => {
    mockFetch({
      status: 409,
      body: {
        success: false,
        error: {
          code: 'ALREADY_ARTIST',
          message: 'User already has the ARTIST role.',
        },
      },
    });

    const user = userEvent.setup();
    render(<ArtistUpgradeForm />);

    await user.type(screen.getByLabelText('Stage Name'), 'MyStage');
    await user.tab();

    const genreSelect = screen.getByLabelText(/Genre Tags/i) as HTMLSelectElement;
    genreSelect.querySelectorAll('option')[0].selected = true;
    fireEvent.change(genreSelect);

    await user.click(screen.getByRole('button', { name: /upgrade to artist/i }));

    await waitFor(() => {
      const banner = screen.getByTestId('upgrade-error-banner');
      expect(banner).toBeVisible();
      expect(banner).toHaveTextContent('User already has the ARTIST role.');
    });
  });

  it('shows success state on successful submission', async () => {
    mockFetch({
      status: 200,
      body: {
        success: true,
        data: {
          user: { id: '1', roles: ['LISTENER', 'ARTIST'] },
          artistProfile: { id: '1', stageName: 'MyStage' },
        },
      },
    });

    const user = userEvent.setup();
    render(<ArtistUpgradeForm />);

    await user.type(screen.getByLabelText('Stage Name'), 'MyStage');
    await user.tab();

    const genreSelect = screen.getByLabelText(/Genre Tags/i) as HTMLSelectElement;
    genreSelect.querySelectorAll('option')[0].selected = true;
    fireEvent.change(genreSelect);

    await user.click(screen.getByRole('button', { name: /upgrade to artist/i }));

    await waitFor(() => {
      const successBanner = screen.getByTestId('upgrade-success-banner');
      expect(successBanner).toBeVisible();
      expect(successBanner).toHaveTextContent('Welcome, Artist!');
    });
  });

  it('displays network error on fetch exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const user = userEvent.setup();
    render(<ArtistUpgradeForm />);

    await user.type(screen.getByLabelText('Stage Name'), 'MyStage');
    await user.tab();

    const genreSelect = screen.getByLabelText(/Genre Tags/i) as HTMLSelectElement;
    genreSelect.querySelectorAll('option')[0].selected = true;
    fireEvent.change(genreSelect);

    await user.click(screen.getByRole('button', { name: /upgrade to artist/i }));

    await waitFor(() => {
      const banner = screen.getByTestId('upgrade-error-banner');
      expect(banner).toBeVisible();
      expect(banner).toHaveTextContent(/network error/i);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Loading state tests                                                */
/* ------------------------------------------------------------------ */

describe('ArtistUpgradeForm: Loading state', () => {
  it('shows loading text and disabled state during submission', async () => {
    // Delay the mock response so loading state is observable
    const mock = mockFetch({
      status: 200,
      body: { success: true, data: { user: {}, artistProfile: {} } },
    });
    mock.mockImplementationOnce(async (url, options) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { user: {}, artistProfile: {} } }),
      };
    });

    const user = userEvent.setup();
    render(<ArtistUpgradeForm />);

    await user.type(screen.getByLabelText('Stage Name'), 'MyStage');
    await user.tab();

    const genreSelect = screen.getByLabelText(/Genre Tags/i) as HTMLSelectElement;
    genreSelect.querySelectorAll('option')[0].selected = true;
    fireEvent.change(genreSelect);

    const submitBtn = screen.getByRole('button', { name: /upgrade to artist/i });
    await user.click(submitBtn);

    // Check loading state before response resolves
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upgrading/i })).toBeInTheDocument();
      expect(submitBtn).toHaveAttribute('aria-disabled', 'true');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  onSuccess callback tests                                           */
/* ------------------------------------------------------------------ */

describe('ArtistUpgradeForm: onSuccess callback', () => {
  it('calls onSuccess with response data on successful submission', async () => {
    const onSuccess = vi.fn();
    mockFetch({
      status: 200,
      body: {
        success: true,
        data: {
          user: { id: '123', roles: ['LISTENER', 'ARTIST'] },
          artistProfile: { id: '456', stageName: 'TestArtist' },
        },
      },
    });

    render(<ArtistUpgradeForm onSuccess={onSuccess} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Stage Name'), 'TestArtist');
    await user.tab();

    const genreSelect = screen.getByLabelText(/Genre Tags/i) as HTMLSelectElement;
    genreSelect.querySelectorAll('option')[0].selected = true;
    fireEvent.change(genreSelect);

    await user.click(screen.getByRole('button', { name: /upgrade to artist/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      const calledWith = onSuccess.mock.calls[0][0];
      expect(calledWith).toHaveProperty('data');
      expect(calledWith.data).toHaveProperty('user');
      expect(calledWith.data).toHaveProperty('artistProfile');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Genre selection tests                                              */
/* ------------------------------------------------------------------ */

describe('ArtistUpgradeForm: Genre selection', () => {
  it('renders all 9 genre options from Prisma Genre enum', () => {
    render(<ArtistUpgradeForm />);
    const genreSelect = screen.getByLabelText(/Genre Tags/i) as HTMLSelectElement;
    expect(genreSelect.options.length).toBe(9);

    const values = Array.from(genreSelect.options).map((o) => o.value);
    expect(values).toContain('INDIE_ROCK');
    expect(values).toContain('BEDROOM_POP');
    expect(values).toContain('ELECTRONIC');
    expect(values).toContain('HIP_HOP');
    expect(values).toContain('LO_FI');
    expect(values).toContain('AMBIENT');
    expect(values).toContain('R_AND_B');
    expect(values).toContain('FOLK');
    expect(values).toContain('OTHER');
  });

  it('displays genre label text in options', () => {
    render(<ArtistUpgradeForm />);
    const genreSelect = screen.getByLabelText(/Genre Tags/i) as HTMLSelectElement;
    const labels = Array.from(genreSelect.options).map((o) => o.textContent);
    expect(labels).toContain('Indie Rock');
    expect(labels).toContain('Hip Hop');
  });
});
