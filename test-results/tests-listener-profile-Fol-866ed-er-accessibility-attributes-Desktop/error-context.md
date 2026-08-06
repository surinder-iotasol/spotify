# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/listener-profile.spec.ts >> Followed Artists Carousel — AC3 >> carousel heading has proper accessibility attributes
- Location: e2e/tests/listener-profile.spec.ts:516:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('followed-artists-heading')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('followed-artists-heading')

```

```yaml
- heading "404" [level=1]
- heading "This page could not be found." [level=2]
- alert
```

# Test source

```ts
  438 |     // The carousel container should have horizontal overflow
  439 |     // Verify it's a flex container with overflow-x-auto
  440 |     const overflow = await carousel.evaluate(
  441 |       (el) => getComputedStyle(el).overflowX,
  442 |     );
  443 |     expect(overflow).toBe("auto");
  444 | 
  445 |     // The carousel should be scrollable (scrollWidth > clientWidth for many items)
  446 |     const scrollWidth = await carousel.evaluate(
  447 |       (el) => el.scrollWidth,
  448 |     );
  449 |     const clientWidth = await carousel.evaluate(
  450 |       (el) => el.clientWidth,
  451 |     );
  452 |     expect(scrollWidth).toBeGreaterThan(clientWidth);
  453 |   });
  454 | 
  455 |   test("carousel artist cards link to artist profiles", async ({
  456 |     page,
  457 |   }) => {
  458 |     await mockProfileResponse(page, {
  459 |       id: "user-1",
  460 |       username: "groovemaster",
  461 |       avatarUrl: "https://example.com/avatar.jpg",
  462 |       registrationYear: 2022,
  463 |       playlists: [],
  464 |       followedArtists: [
  465 |         {
  466 |           id: "ap-carousel",
  467 |           displayName: "Carousel Artist",
  468 |           avatarUrl: "https://example.com/carousel.jpg",
  469 |           isVerified: true,
  470 |         },
  471 |       ],
  472 |     });
  473 | 
  474 |     await page.goto(PROFILE_URL);
  475 | 
  476 |     const artistCard = page.getByTestId("followed-artist-ap-carousel");
  477 |     await expect(artistCard).toBeVisible();
  478 | 
  479 |     const link = artistCard.locator("a");
  480 |     await expect(link).toBeVisible();
  481 |     await expect(link).toHaveAttribute("href", "/artists/ap-carousel");
  482 |     await expect(link).toHaveAttribute(
  483 |       "aria-label",
  484 |       "Carousel Artist (verified)",
  485 |     );
  486 |   });
  487 | 
  488 |   test("carousel renders placeholder for artists without avatars", async ({
  489 |     page,
  490 |   }) => {
  491 |     await mockProfileResponse(page, {
  492 |       id: "user-1",
  493 |       username: "groovemaster",
  494 |       avatarUrl: "https://example.com/avatar.jpg",
  495 |       registrationYear: 2022,
  496 |       playlists: [],
  497 |       followedArtists: [
  498 |         {
  499 |           id: "ap-nopic",
  500 |           displayName: "No Pic Artist",
  501 |           avatarUrl: null,
  502 |           isVerified: false,
  503 |         },
  504 |       ],
  505 |     });
  506 | 
  507 |     await page.goto(PROFILE_URL);
  508 | 
  509 |     const artistCard = page.getByTestId("followed-artist-ap-nopic");
  510 |     await expect(artistCard).toBeVisible();
  511 | 
  512 |     // Should show the initial letter placeholder
  513 |     await expect(artistCard).toContainText("N");
  514 |   });
  515 | 
  516 |   test("carousel heading has proper accessibility attributes", async ({
  517 |     page,
  518 |   }) => {
  519 |     await mockProfileResponse(page, {
  520 |       id: "user-1",
  521 |       username: "groovemaster",
  522 |       avatarUrl: "https://example.com/avatar.jpg",
  523 |       registrationYear: 2022,
  524 |       playlists: [],
  525 |       followedArtists: [
  526 |         {
  527 |           id: "ap-1",
  528 |           displayName: "Artist One",
  529 |           avatarUrl: "https://example.com/a1.jpg",
  530 |           isVerified: false,
  531 |         },
  532 |       ],
  533 |     });
  534 | 
  535 |     await page.goto(PROFILE_URL);
  536 | 
  537 |     const heading = page.getByTestId("followed-artists-heading");
> 538 |     await expect(heading).toBeVisible();
      |                           ^ Error: expect(locator).toBeVisible() failed
  539 |     await expect(heading).toHaveAttribute("id", "followed-artists-heading");
  540 | 
  541 |     // Section should have aria-labelledby pointing to the heading
  542 |     const section = page.locator(
  543 |       'section[aria-labelledby="followed-artists-heading"]',
  544 |     );
  545 |     await expect(section).toBeVisible();
  546 |   });
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
```