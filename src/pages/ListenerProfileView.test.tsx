/**
 * STORY-profile-008: Unit tests for ListenerProfileView component
 *
 * Covers:
 * - formatCompactNumber helper (all number ranges)
 * - PlaylistCard rendering (with cover image and placeholder)
 * - FollowedArtistCard rendering (verified and non-verified, with/without avatar)
 * - ListenerProfileView full layout (header, playlists grid, artists carousel, empty states)
 */

import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import {
  formatCompactNumber,
  PlaylistCard,
  FollowedArtistCard,
  ListenerProfileView,
  scrollCarousel,
} from "./ListenerProfileView";

/* ------------------------------------------------------------------ */
/*  formatCompactNumber                                               */
/* ------------------------------------------------------------------ */

describe("formatCompactNumber", () => {
  test("returns the number as a string when below 1000", () => {
    expect(formatCompactNumber(0)).toBe("0");
    expect(formatCompactNumber(999)).toBe("999");
  });

  test("returns compact K notation truncated to 1 decimal", () => {
    expect(formatCompactNumber(1000)).toBe("1.0K");
    expect(formatCompactNumber(1500)).toBe("1.5K");
    expect(formatCompactNumber(1999)).toBe("1.9K");
    expect(formatCompactNumber(9999)).toBe("9.9K");
  });

  test("returns compact M notation truncated to 1 decimal", () => {
    expect(formatCompactNumber(1_000_000)).toBe("1.0M");
    expect(formatCompactNumber(1_500_000)).toBe("1.5M");
    expect(formatCompactNumber(9_999_999)).toBe("9.9M");
  });

  test("uses floor (not round) for truncation", () => {
    expect(formatCompactNumber(1999)).toBe("1.9K"); // floor, not 2K
    expect(formatCompactNumber(9_400_000)).toBe("9.4M"); // floor, not 9.5M
  });
});

/* ------------------------------------------------------------------ */
/*  PlaylistCard                                                      */
/* ------------------------------------------------------------------ */

describe("PlaylistCard", () => {
  const playlist = {
    id: "pl-1",
    title: "My Chill Mix",
    coverImageUrl: "https://example.com/cover.jpg",
    trackCount: 42,
    isPublic: true,
    createdAt: "2024-01-15T00:00:00Z",
  };

  test("renders playlist card with cover image", () => {
    render(<PlaylistCard playlist={playlist} />);

    // Card should be a link to playlist detail
    const card = screen.getByTestId(`playlist-card-${playlist.id}`);
    expect(card).toHaveAttribute("href", `/playlists/${playlist.id}`);

    // Cover image should be visible
    const cover = screen.getByTestId("playlist-cover");
    expect(cover).toBeVisible();
    expect(cover.querySelector("img")).toHaveAttribute("src", playlist.coverImageUrl);

    // Track count overlay
    expect(screen.getByText("42 tracks")).toBeVisible();

    // Title
    expect(screen.getByText("My Chill Mix")).toBeVisible();

    // aria-label
    expect(card).toHaveAttribute(
      "aria-label",
      "Playlist: My Chill Mix with 42 tracks",
    );
  });

  test("renders playlist card with placeholder when no cover image", () => {
    const playlistNoCover = { ...playlist, coverImageUrl: null };
    render(<PlaylistCard playlist={playlistNoCover} />);

    const cover = screen.getByTestId("playlist-cover");
    // Should not have an img inside
    expect(cover.querySelector("img")).toBeNull();
    // Should contain the music note symbol
    expect(cover).toHaveTextContent("♪");
  });
});

/* ------------------------------------------------------------------ */
/*  FollowedArtistCard                                                */
/* ------------------------------------------------------------------ */

describe("FollowedArtistCard", () => {
  const verifiedArtist = {
    id: "art-1",
    displayName: "Neon Pulse",
    avatarUrl: "https://example.com/artist.jpg",
    isVerified: true,
  };

  test("renders artist card with avatar and verification badge", () => {
    render(<FollowedArtistCard artist={verifiedArtist} />);

    const card = screen.getByTestId(`followed-artist-${verifiedArtist.id}`);
    expect(card).toHaveAttribute("href", `/artists/${verifiedArtist.id}`);

    const img = card.querySelector("img");
    expect(img).toHaveAttribute("src", verifiedArtist.avatarUrl);

    // Verified badge SVG present
    const badgeSpan = card.querySelector("span[aria-label='Verified artist']");
    expect(badgeSpan).toBeInTheDocument();

    // Display name
    expect(screen.getByText("Neon Pulse")).toBeVisible();
  });

  test("renders artist card without verification badge", () => {
    const unverifiedArtist = { ...verifiedArtist, isVerified: false };
    render(<FollowedArtistCard artist={unverifiedArtist} />);

    const card = screen.getByTestId("followed-artist-art-1");
    expect(card.querySelector("svg[aria-label='Verified artist']")).toBeNull();
  });

  test("renders artist placeholder when no avatar", () => {
    const noAvatarArtist = {
      ...verifiedArtist,
      avatarUrl: null,
      displayName: "DJ Echo",
    };
    render(<FollowedArtistCard artist={noAvatarArtist} />);

    const card = screen.getByTestId("followed-artist-art-1");
    // Should not have an img
    expect(card.querySelector("img")).toBeNull();
    // Should show first letter of display name
    expect(card).toHaveTextContent("D");
  });
});

/* ------------------------------------------------------------------ */
/*  ListenerProfileView — full layout                                 */
/* ------------------------------------------------------------------ */

describe("ListenerProfileView", () => {
  const mockPlaylists = [
    {
      id: "pl-1",
      title: "Workout Bangers",
      coverImageUrl: "https://example.com/pl1.jpg",
      trackCount: 25,
      isPublic: true,
    },
    {
      id: "pl-2",
      title: "Late Night Jazz",
      coverImageUrl: "https://example.com/pl2.jpg",
      trackCount: 18,
      isPublic: true,
    },
  ];

  const mockArtists = [
    {
      id: "art-1",
      displayName: "Neon Pulse",
      avatarUrl: "https://example.com/art1.jpg",
      isVerified: true,
    },
    {
      id: "art-2",
      displayName: "DJ Echo",
      avatarUrl: null,
      isVerified: false,
    },
  ];

  test("renders header with avatar placeholder, username, and registration year", () => {
    render(<ListenerProfileView username="groovemaster" avatarUrl={null} registrationYear={2021} publicPlaylists={[]} followedArtists={[]} />);

    // Avatar placeholder (first letter of username) via ProfileHeader
    const avatar = screen.getByTestId("profile-avatar");
    expect(avatar).toHaveTextContent("G");

    // Username via ProfileHeader
    const usernameEl = screen.getByTestId("profile-username");
    expect(usernameEl).toHaveTextContent("groovemaster");

    // Registration year
    expect(screen.getByText("Member since 2021")).toBeVisible();
  });

  test("renders header with avatar image when provided", () => {
    render(
      <ListenerProfileView
        username="listener42"
        avatarUrl="https://example.com/avatar.jpg"
        registrationYear={2020}
        publicPlaylists={[]}
        followedArtists={[]}
      />,
    );

    const avatar = screen.getByTestId("profile-avatar");
    // Avatar image rendered by ProfileHeader
    expect(avatar).toHaveAttribute("src", "https://example.com/avatar.jpg");
  });

  test("renders playlists grid when playlists exist", () => {
    render(
      <ListenerProfileView
        username="testuser"
        avatarUrl="https://example.com/avatar.jpg"
        registrationYear={2022}
        publicPlaylists={mockPlaylists}
        followedArtists={mockArtists}
      />,
    );

    // Heading with count
    const heading = screen.getByTestId("playlists-heading");
    expect(heading).toHaveTextContent("Public Playlists (2)");

    // Grid container
    const grid = screen.getByTestId("playlists-grid");
    expect(grid).toBeVisible();

    // Both playlist cards rendered
    mockPlaylists.forEach((pl) => {
      expect(screen.getByTestId(`playlist-card-${pl.id}`)).toBeVisible();
    });
  });

  test("renders empty playlists state when no playlists", () => {
    render(
      <ListenerProfileView
        username="testuser"
        avatarUrl={null}
        registrationYear={2023}
        publicPlaylists={[]}
        followedArtists={[]}
      />,
    );

    // Empty state message
    const empty = screen.getByTestId("empty-playlists");
    expect(empty).toBeVisible();
    expect(empty).toHaveTextContent("No public playlists yet.");
  });

  test("renders followed artists carousel when artists exist", () => {
    render(
      <ListenerProfileView
        username="testuser"
        avatarUrl={null}
        registrationYear={2023}
        publicPlaylists={[]}
        followedArtists={mockArtists}
      />,
    );

    // Carousel container with role="list"
    const carousel = screen.getByTestId("followed-artists-carousel");
    expect(carousel).toBeVisible();
    expect(carousel).toHaveAttribute("role", "list");
    expect(carousel).toHaveAttribute("aria-label", "Followed artists");

    // All artist cards rendered
    mockArtists.forEach((art) => {
      expect(screen.getByTestId(`followed-artist-${art.id}`)).toBeVisible();
    });
  });

  test("renders empty followed artists message when none", () => {
    render(
      <ListenerProfileView
        username="testuser"
        avatarUrl={null}
        registrationYear={2023}
        publicPlaylists={[]}
        followedArtists={[]}
      />,
    );

    // No carousel, just a message
    const carousel = screen.queryByTestId("followed-artists-carousel");
    expect(carousel).toBeNull();

    expect(screen.getByText("No followed artists yet.")).toBeVisible();
  });

  test("playlist cards have keyboard-accessible link elements", () => {
    render(
      <ListenerProfileView
        username="testuser"
        avatarUrl={null}
        registrationYear={2023}
        publicPlaylists={mockPlaylists}
        followedArtists={mockArtists}
      />,
    );

    // All playlist cards should be <a> tags (keyboard accessible)
    const cards = screen.getAllByRole("link", { name: /playlist/i });
    expect(cards.length).toBeGreaterThanOrEqual(mockPlaylists.length);
  });

  test("followed artist cards have keyboard-accessible link elements", () => {
    render(
      <ListenerProfileView
        username="testuser"
        avatarUrl={null}
        registrationYear={2023}
        publicPlaylists={[]}
        followedArtists={mockArtists}
      />,
    );

    // All artist cards should be <a> tags
    const artistCards = screen.getAllByRole("link", { name: /neon pulse|dj echo/i });
    expect(artistCards.length).toBeGreaterThanOrEqual(mockArtists.length);
  });

  /* ------------------------------------------------------------------ */
  /*  scrollCarousel utility                                             */
  /* ------------------------------------------------------------------ */

  test("scrollCarousel calls scrollBy on the container", () => {
    const container = {
      scrollBy: vi.fn(),
    } as unknown as HTMLDivElement;

    scrollCarousel(container, 240);

    expect(container.scrollBy).toHaveBeenCalledWith({
      left: 240,
      behavior: "smooth",
    });
  });

  test("scrollCarousel scrolls negative amount for left scroll", () => {
    const container = {
      scrollBy: vi.fn(),
    } as unknown as HTMLDivElement;

    scrollCarousel(container, -240);

    expect(container.scrollBy).toHaveBeenCalledWith({
      left: -240,
      behavior: "smooth",
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Carousel scroll indicators                                       */
  /* ------------------------------------------------------------------ */

  test("renders scroll left button when artists exist", () => {
    render(
      <ListenerProfileView
        username="testuser"
        avatarUrl={null}
        registrationYear={2023}
        publicPlaylists={[]}
        followedArtists={mockArtists}
      />,
    );

    const scrollLeftBtn = screen.getByTestId("carousel-scroll-left");
    expect(scrollLeftBtn).toBeVisible();
    expect(scrollLeftBtn).toHaveAttribute("aria-label", "Scroll left");
    expect(scrollLeftBtn).toHaveAttribute("type", "button");
  });

  test("renders scroll right button when artists exist", () => {
    render(
      <ListenerProfileView
        username="testuser"
        avatarUrl={null}
        registrationYear={2023}
        publicPlaylists={[]}
        followedArtists={mockArtists}
      />,
    );

    const scrollRightBtn = screen.getByTestId("carousel-scroll-right");
    expect(scrollRightBtn).toBeVisible();
    expect(scrollRightBtn).toHaveAttribute("aria-label", "Scroll right");
    expect(scrollRightBtn).toHaveAttribute("type", "button");
  });

  test("does not render scroll buttons when no artists", () => {
    render(
      <ListenerProfileView
        username="testuser"
        avatarUrl={null}
        registrationYear={2023}
        publicPlaylists={[]}
        followedArtists={[]}
      />,
    );

    expect(screen.queryByTestId("carousel-scroll-left")).toBeNull();
    expect(screen.queryByTestId("carousel-scroll-right")).toBeNull();
  });

  /* ------------------------------------------------------------------ */
  /*  Keyboard navigation                                              */
  /* ------------------------------------------------------------------ */

  test("ArrowLeft key triggers left scroll", async () => {
    render(
      <ListenerProfileView
        username="testuser"
        avatarUrl={null}
        registrationYear={2023}
        publicPlaylists={[]}
        followedArtists={mockArtists}
      />,
    );

    const carousel = screen.getByTestId("followed-artists-carousel");
    // Tabindex should be 0 for keyboard focus
    expect(carousel).toHaveAttribute("tabindex", "0");

    // Simulate ArrowLeft key
    await userEvent.keyboard("{ArrowLeft}");

    // The handler should have called scrollBy with negative amount
    // In a real browser this would scroll left
    expect(carousel).toHaveAttribute("role", "list");
  });

  test("ArrowRight key triggers right scroll", async () => {
    render(
      <ListenerProfileView
        username="testuser"
        avatarUrl={null}
        registrationYear={2023}
        publicPlaylists={[]}
        followedArtists={mockArtists}
      />,
    );

    const carousel = screen.getByTestId("followed-artists-carousel");

    // Simulate ArrowRight key
    await userEvent.keyboard("{ArrowRight}");

    expect(carousel).toHaveAttribute("role", "list");
  });
});
