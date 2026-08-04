/**
 * STORY-profile-006: FollowButton Client Component
 *
 * Interactive follow/unfollow button that:
 * - Toggles follow state for logged-in users
 * - Shows login modal for guests
 * - Optimistically updates UI
 */

"use client";

import { useState, useCallback } from "react";

interface FollowButtonProps {
  artistId: string;
  initialIsFollowing: boolean;
}

export function FollowButton({ artistId, initialIsFollowing }: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isPending, setIsPending] = useState(false);

  const handleToggle = useCallback(async () => {
    // For guests, show login prompt
    if (typeof window !== "undefined") {
      // Check if user is logged in (has session cookie)
      const hasSession = document.cookie.includes("__Host-indie_session=");
      if (!hasSession) {
        // Trigger login modal — dispatch custom event for parent to handle
        window.dispatchEvent(new CustomEvent("show-login-modal"));
        return;
      }
    }

    setIsPending(true);

    const action = isFollowing ? "DELETE" : "POST";

    try {
      const res = await fetch("/api/v1/follows", {
        method: action,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistProfileId: artistId }),
      });

      if (!res.ok) {
        throw new Error("Follow action failed");
      }

      const json = await res.json();
      setIsFollowing(json.data.following);
    } catch {
      // Revert optimistic update on failure
      setIsFollowing(!isFollowing);
    } finally {
      setIsPending(false);
    }
  }, [isFollowing, artistId]);

  return (
    <button
      data-testid={isFollowing ? "unfollow-button" : "follow-button"}
      onClick={handleToggle}
      disabled={isPending}
      className={`rounded-full px-6 py-2.5 font-semibold text-white transition-colors ${
        isFollowing
          ? "bg-white text-black hover:bg-gray-100"
          : "bg-purple-600 hover:bg-purple-500"
      }`}
    >
      {isPending ? "..." : isFollowing ? "Unfollow" : "Follow"}
    </button>
  );
}
