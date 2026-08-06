/**
 * STORY-profile-008c: Unit tests for PlaylistCard component
 *
 * Covers all acceptance criteria:
 * - Card shows cover mosaic image (or placeholder fallback)
 * - Card shows playlist title and track count
 * - Card is clickable and navigates to playlist detail page
 */

import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaylistCard } from "./PlaylistCard";

/* ------------------------------------------------------------------ */
/*  AC2: Each card shows cover mosaic, title, and track count         */
/* ------------------------------------------------------------------ */

describe("PlaylistCard — AC2: renders cover, title, track count", () => {
  test("renders cover image when coverImageUrl is provided", () => {
    render(<PlaylistCard id="p1" title="My Mix" coverImageUrl="/cover.jpg" trackCount={10} />);

    const img = screen.getByAltText("My Mix cover");
    expect(img).toHaveAttribute("src", "/cover.jpg");
  });

  test("renders title text", () => {
    render(<PlaylistCard id="p1" title="My Mix" coverImageUrl="/cover.jpg" trackCount={10} />);

    expect(screen.getByText("My Mix")).toBeVisible();
  });

  test("renders track count overlay", () => {
    render(<PlaylistCard id="p1" title="My Mix" coverImageUrl="/cover.jpg" trackCount={10} />);

    expect(screen.getByText("10 tracks")).toBeVisible();
  });

  test("renders placeholder when coverImageUrl is null", () => {
    render(<PlaylistCard id="p1" title="My Mix" coverImageUrl={null} trackCount={5} />);

    // Should show the music note placeholder
    const placeholder = screen.getByText("♪");
    expect(placeholder).toBeVisible();
    // Should not show an img
    expect(screen.queryByAltText("My Mix cover")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  AC3: Card is clickable and navigates to playlist detail          */
/* ------------------------------------------------------------------ */

describe("PlaylistCard — AC3: clickable navigation", () => {
  test("renders as anchor linking to playlist detail page", () => {
    render(<PlaylistCard id="p1" title="My Mix" coverImageUrl="/cover.jpg" trackCount={10} />);

    const link = screen.getByRole("link", { name: "Playlist: My Mix with 10 tracks" });
    expect(link).toHaveAttribute("href", "/playlists/p1");
  });

  test("has descriptive aria-label", () => {
    render(<PlaylistCard id="p42" title="Chill Vibes" coverImageUrl="/chill.jpg" trackCount={25} />);

    const link = screen.getByRole("link", { name: "Playlist: Chill Vibes with 25 tracks" });
    expect(link).toBeInTheDocument();
  });

  test("has data-testid for E2E testing", () => {
    render(<PlaylistCard id="p99" title="Test" coverImageUrl="/t.jpg" trackCount={3} />);

    const card = screen.getByTestId("playlist-card-p99");
    expect(card).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases                                                         */
/* ------------------------------------------------------------------ */

describe("PlaylistCard — edge cases", () => {
  test("handles zero tracks", () => {
    render(<PlaylistCard id="empty" title="Empty" coverImageUrl="/e.jpg" trackCount={0} />);

    expect(screen.getByText("0 tracks")).toBeVisible();
    expect(screen.getByAltText("Empty cover")).toBeInTheDocument();
  });

  test("handles long title with truncate", () => {
    const longTitle = "A Very Long Playlist Title That Should Be Truncated In The UI";
    render(<PlaylistCard id="long" title={longTitle} coverImageUrl="/l.jpg" trackCount={100} />);

    expect(screen.getByText(longTitle)).toBeVisible();
  });
});
