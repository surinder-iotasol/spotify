# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/listener-profile.spec.ts >> Accessibility and edge cases >> profile page has proper document outline with headings
- Location: e2e/tests/listener-profile.spec.ts:616:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('profile-username')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('profile-username')

```

```yaml
- heading "404" [level=1]
- heading "This page could not be found." [level=2]
- alert
```

# Test source

```ts
  547 | 
  548 |   test("carousel is responsive on mobile viewport", async ({ page }) => {
  549 |     await mockProfileResponse(page, {
  550 |       id: "user-1",
  551 |       username: "mobileuser",
  552 |       avatarUrl: null,
  553 |       registrationYear: 2023,
  554 |       playlists: [],
  555 |       followedArtists: [
  556 |         {
  557 |           id: "ap-1",
  558 |           displayName: "Artist One",
  559 |           avatarUrl: null,
  560 |           isVerified: false,
  561 |         },
  562 |         {
  563 |           id: "ap-2",
  564 |           displayName: "Artist Two",
  565 |           avatarUrl: null,
  566 |           isVerified: true,
  567 |         },
  568 |       ],
  569 |     });
  570 | 
  571 |     await page.setViewportSize({ width: 375, height: 812 });
  572 | 
  573 |     // Use a broader route pattern since we changed viewport first
  574 |     await mockProfileResponse(page, {
  575 |       id: "user-1",
  576 |       username: "mobileuser",
  577 |       avatarUrl: null,
  578 |       registrationYear: 2023,
  579 |       playlists: [],
  580 |       followedArtists: [
  581 |         {
  582 |           id: "ap-1",
  583 |           displayName: "Artist One",
  584 |           avatarUrl: null,
  585 |           isVerified: false,
  586 |         },
  587 |         {
  588 |           id: "ap-2",
  589 |           displayName: "Artist Two",
  590 |           avatarUrl: null,
  591 |           isVerified: true,
  592 |         },
  593 |       ],
  594 |     });
  595 | 
  596 |     await page.goto(PROFILE_URL);
  597 | 
  598 |     // All elements should still be visible on mobile
  599 |     await expect(page.getByTestId("profile-header")).toBeVisible();
  600 |     await expect(page.getByTestId("followed-artists-carousel")).toBeVisible();
  601 | 
  602 |     // Carousel should still be scrollable on mobile
  603 |     const carousel = page.getByTestId("followed-artists-carousel");
  604 |     const overflow = await carousel.evaluate(
  605 |       (el) => getComputedStyle(el).overflowX,
  606 |     );
  607 |     expect(overflow).toBe("auto");
  608 |   });
  609 | });
  610 | 
  611 | /* ------------------------------------------------------------------ */
  612 | /*  Accessibility & edge cases                                        */
  613 | /* ------------------------------------------------------------------ */
  614 | 
  615 | test.describe("Accessibility and edge cases", () => {
  616 |   test("profile page has proper document outline with headings", async ({
  617 |     page,
  618 |   }) => {
  619 |     await mockProfileResponse(page, {
  620 |       id: "user-1",
  621 |       username: "accessiblerex",
  622 |       avatarUrl: "https://example.com/avatar.jpg",
  623 |       registrationYear: 2022,
  624 |       playlists: [
  625 |         {
  626 |           id: "pl-1",
  627 |           title: "Test Playlist",
  628 |           coverImageUrl: null,
  629 |           trackCount: 5,
  630 |           isPublic: true,
  631 |         },
  632 |       ],
  633 |       followedArtists: [
  634 |         {
  635 |           id: "ap-1",
  636 |           displayName: "Test Artist",
  637 |           avatarUrl: null,
  638 |           isVerified: false,
  639 |         },
  640 |       ],
  641 |     });
  642 | 
  643 |     await page.goto(PROFILE_URL);
  644 | 
  645 |     // Profile username should be h1 (main heading)
  646 |     const username = page.getByTestId("profile-username");
> 647 |     await expect(username).toBeVisible();
      |                            ^ Error: expect(locator).toBeVisible() failed
  648 | 
  649 |     // Playlist section heading
  650 |     const playlistHeading = page.getByTestId("playlists-heading");
  651 |     await expect(playlistHeading).toBeVisible();
  652 |     await expect(playlistHeading).toHaveAttribute("id", "public-playlists-heading");
  653 | 
  654 |     // Followed artists section heading
  655 |     const artistHeading = page.getByTestId("followed-artists-heading");
  656 |     await expect(artistHeading).toBeVisible();
  657 |     await expect(artistHeading).toHaveAttribute("id", "followed-artists-heading");
  658 |   });
  659 | 
  660 |   test("playlist card cover shows music note when no cover image", async ({
  661 |     page,
  662 |   }) => {
  663 |     await mockProfileResponse(page, {
  664 |       id: "user-1",
  665 |       username: "groovemaster",
  666 |       avatarUrl: "https://example.com/avatar.jpg",
  667 |       registrationYear: 2022,
  668 |       playlists: [
  669 |         {
  670 |           id: "pl-nocover",
  671 |           title: "No Cover Mix",
  672 |           coverImageUrl: null,
  673 |           trackCount: 7,
  674 |           isPublic: true,
  675 |         },
  676 |       ],
  677 |       followedArtists: [],
  678 |     });
  679 | 
  680 |     await page.goto(PROFILE_URL);
  681 | 
  682 |     const card = page.getByTestId("playlist-card-pl-nocover");
  683 |     await expect(card).toBeVisible();
  684 | 
  685 |     // The cover area should show the music note symbol
  686 |     const cover = card.locator("[data-testid='playlist-cover']");
  687 |     await expect(cover).toBeVisible();
  688 |     await expect(cover).toContainText("♪");
  689 |   });
  690 | });
  691 | 
```