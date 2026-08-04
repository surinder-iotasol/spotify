/**
 * STORY-profile-008b: Unit tests for ProfileHeader component
 *
 * Covers all acceptance criteria:
 * - Header renders user avatar from avatarUrl, username, and registration year.
 * - Avatar falls back to a default placeholder when no image is available.
 * - Passes WCAG 2.1 AA with alt text on the avatar image.
 */

import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfileHeader } from "./ProfileHeader";

/* ------------------------------------------------------------------ */
/*  AC1: Header renders avatar, username, and registration year       */
/* ------------------------------------------------------------------ */

describe("ProfileHeader — AC1: renders avatar, username, registration year", () => {
  test("renders avatar image when avatarUrl is provided", () => {
    render(
      <ProfileHeader
        username="groovemaster"
        avatarUrl="https://example.com/avatar.jpg"
        registrationYear={2022}
      />,
    );

    // Avatar image with correct src
    const avatar = screen.getByTestId("profile-avatar");
    expect(avatar).toHaveAttribute("src", "https://example.com/avatar.jpg");
  });

  test("renders descriptive alt text on avatar image (WCAG 2.1 AA)", () => {
    render(
      <ProfileHeader
        username="groovemaster"
        avatarUrl="https://example.com/avatar.jpg"
        registrationYear={2022}
      />,
    );

    const avatar = screen.getByTestId("profile-avatar") as HTMLImageElement;
    expect(avatar).toHaveAttribute("alt", "groovemaster's avatar");
  });

  test("renders username as heading", () => {
    render(
      <ProfileHeader
        username="listener42"
        avatarUrl="https://example.com/avatar.jpg"
        registrationYear={2020}
      />,
    );

    const usernameEl = screen.getByTestId("profile-username");
    expect(usernameEl).toHaveTextContent("listener42");
  });

  test("renders registration year with Member since prefix", () => {
    render(
      <ProfileHeader
        username="listener42"
        avatarUrl={null}
        registrationYear={2020}
      />,
    );

    expect(screen.getByText("Member since 2020")).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/*  AC2: Avatar falls back to default placeholder                     */
/* ------------------------------------------------------------------ */

describe("ProfileHeader — AC2: avatar fallback placeholder", () => {
  test("renders placeholder div when avatarUrl is null", () => {
    render(
      <ProfileHeader
        username="groovemaster"
        avatarUrl={null}
        registrationYear={2021}
      />,
    );

    const avatar = screen.getByTestId("profile-avatar");
    // Placeholder should be a div with the first letter
    expect(avatar).toHaveTextContent("G");
    // Should not be an img element
    expect(avatar.querySelector("img")).toBeNull();
  });

  test("renders placeholder div when avatarUrl is empty string", () => {
    render(
      <ProfileHeader
        username="listener42"
        avatarUrl=""
        registrationYear={2023}
      />,
    );

    const avatar = screen.getByTestId("profile-avatar");
    // Empty string is falsy, should show placeholder
    expect(avatar).toHaveTextContent("L");
    expect(avatar.querySelector("img")).toBeNull();
  });

  test("placeholder shows first letter of username", () => {
    render(
      <ProfileHeader
        username="NeonPulse"
        avatarUrl={null}
        registrationYear={2023}
      />,
    );

    const avatar = screen.getByTestId("profile-avatar");
    // First letter uppercased
    expect(avatar).toHaveTextContent("N");
  });
});

/* ------------------------------------------------------------------ */
/*  AC3: WCAG 2.1 AA — alt text and accessibility                     */
/* ------------------------------------------------------------------ */

describe("ProfileHeader — AC3: WCAG 2.1 AA accessibility", () => {
  test("avatar image has alt text when image is displayed", () => {
    render(
      <ProfileHeader
        username="testuser"
        avatarUrl="https://example.com/avatar.jpg"
        registrationYear={2021}
      />,
    );

    const avatar = screen.getByTestId("profile-avatar") as HTMLImageElement;
    expect(avatar).toHaveAttribute("alt", "testuser's avatar");
    // Verify it is an img element (not a div)
    expect(avatar.tagName).toBe("IMG");
  });

  test("avatar placeholder has aria-label when no image", () => {
    render(
      <ProfileHeader
        username="testuser"
        avatarUrl={null}
        registrationYear={2021}
      />,
    );

    const avatar = screen.getByTestId("profile-avatar");
    // Placeholder div should have aria-label for screen readers
    expect(avatar).toHaveAttribute(
      "aria-label",
      "testuser's avatar placeholder",
    );
    // Verify it is a div element (not an img)
    expect(avatar.tagName).toBe("DIV");
  });

  test("username heading is accessible", () => {
    render(
      <ProfileHeader
        username="accessible_user"
        avatarUrl={null}
        registrationYear={2023}
      />,
    );

    const usernameEl = screen.getByTestId("profile-username");
    // Should be a heading element (h1)
    expect(usernameEl.tagName).toBe("H1");
    expect(usernameEl).toHaveTextContent("accessible_user");
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases                                                         */
/* ------------------------------------------------------------------ */

describe("ProfileHeader — edge cases", () => {
  test("renders with empty username gracefully", () => {
    render(
      <ProfileHeader
        username=""
        avatarUrl={null}
        registrationYear={2023}
      />,
    );

    // Should not crash
    const usernameEl = screen.getByTestId("profile-username");
    expect(usernameEl).toHaveTextContent("");
  });

  test("renders with zero registration year", () => {
    render(
      <ProfileHeader
        username="user"
        avatarUrl={null}
        registrationYear={0}
      />,
    );

    expect(screen.getByText("Member since 0")).toBeVisible();
  });
});
