# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/listener-profile.spec.ts >> Followed Artists Carousel — AC3 >> carousel renders with followed artist cards
- Location: e2e/tests/listener-profile.spec.ts:364:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('followed-artists-carousel')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('followed-artists-carousel')

```

```yaml
- heading "404" [level=1]
- heading "This page could not be found." [level=2]
- alert
```

# Test source

```ts
  297 |       username: "groovemaster",
  298 |       avatarUrl: "https://example.com/avatar.jpg",
  299 |       registrationYear: 2022,
  300 |       playlists: [
  301 |         {
  302 |           id: "pl-focus",
  303 |           title: "Focus Beats",
  304 |           coverImageUrl: "https://example.com/focus.jpg",
  305 |           trackCount: 30,
  306 |           isPublic: true,
  307 |         },
  308 |       ],
  309 |       followedArtists: [],
  310 |     });
  311 | 
  312 |     await page.goto(PROFILE_URL);
  313 | 
  314 |     // Tab to the playlist card link
  315 |     await page.keyboard.press("Tab");
  316 | 
  317 |     // The focused element should be the anchor
  318 |     const focused = page.locator(":focus");
  319 |     await expect(focused).toHaveAttribute("href", "/playlists/pl-focus");
  320 | 
  321 |     // Verify the anchor is an <a> tag with proper semantics
  322 |     await expect(focused).toHaveAttribute("role", "link");
  323 |   });
  324 | 
  325 |   test("playlist card shows hover and focus visual states", async ({
  326 |     page,
  327 |   }) => {
  328 |     await mockProfileResponse(page, {
  329 |       id: "user-1",
  330 |       username: "groovemaster",
  331 |       avatarUrl: "https://example.com/avatar.jpg",
  332 |       registrationYear: 2022,
  333 |       playlists: [
  334 |         {
  335 |           id: "pl-hover",
  336 |           title: "Hover Test",
  337 |           coverImageUrl: "https://example.com/hover.jpg",
  338 |           trackCount: 10,
  339 |           isPublic: true,
  340 |         },
  341 |       ],
  342 |       followedArtists: [],
  343 |     });
  344 | 
  345 |     await page.goto(PROFILE_URL);
  346 | 
  347 |     const card = page.getByTestId("playlist-card-pl-hover");
  348 | 
  349 |     // Hover state
  350 |     await card.hover();
  351 |     // Should get purple border on hover (focus-within:border-purple-500 on focus)
  352 |     const cardElement = card.locator("a");
  353 |     // Verify the link element exists and is interactive
  354 |     await expect(cardElement).toBeVisible();
  355 |     await expect(cardElement).toBeEnabled();
  356 |   });
  357 | });
  358 | 
  359 | /* ------------------------------------------------------------------ */
  360 | /*  AC3: Carousel renders and supports horizontal scroll              */
  361 | /* ------------------------------------------------------------------ */
  362 | 
  363 | test.describe("Followed Artists Carousel — AC3", () => {
  364 |   test("carousel renders with followed artist cards", async ({ page }) => {
  365 |     await mockProfileResponse(page, {
  366 |       id: "user-1",
  367 |       username: "groovemaster",
  368 |       avatarUrl: "https://example.com/avatar.jpg",
  369 |       registrationYear: 2022,
  370 |       playlists: [],
  371 |       followedArtists: [
  372 |         {
  373 |           id: "ap-1",
  374 |           displayName: "Echo Waves",
  375 |           avatarUrl: "https://example.com/artist1.jpg",
  376 |           isVerified: true,
  377 |         },
  378 |         {
  379 |           id: "ap-2",
  380 |           displayName: "Neon Drift",
  381 |           avatarUrl: null,
  382 |           isVerified: false,
  383 |         },
  384 |         {
  385 |           id: "ap-3",
  386 |           displayName: "Static Bloom",
  387 |           avatarUrl: "https://example.com/artist3.jpg",
  388 |           isVerified: false,
  389 |         },
  390 |       ],
  391 |     });
  392 | 
  393 |     await page.goto(PROFILE_URL);
  394 | 
  395 |     // Carousel container should be visible
  396 |     const carousel = page.getByTestId("followed-artists-carousel");
> 397 |     await expect(carousel).toBeVisible();
      |                            ^ Error: expect(locator).toBeVisible() failed
  398 | 
  399 |     // All artist cards should be visible
  400 |     await expect(page.getByTestId("followed-artist-ap-1")).toBeVisible();
  401 |     await expect(page.getByTestId("followed-artist-ap-2")).toBeVisible();
  402 |     await expect(page.getByTestId("followed-artist-ap-3")).toBeVisible();
  403 | 
  404 |     // Carousel heading should show correct count
  405 |     await expect(page.getByTestId("followed-artists-heading")).toContainText(
  406 |       "Followed Artists (3)",
  407 |     );
  408 |   });
  409 | 
  410 |   test("carousel supports horizontal scrolling via API", async ({ page }) => {
  411 |     // Generate many artists to force horizontal overflow
  412 |     const followedArtists: Array<{
  413 |       id: string;
  414 |       displayName: string;
  415 |       avatarUrl: string | null;
  416 |       isVerified: boolean;
  417 |     }> = Array.from({ length: 20 }, (_, i) => ({
  418 |       id: `ap-${i}`,
  419 |       displayName: `Artist ${i}`,
  420 |       avatarUrl: i % 2 === 0 ? `https://example.com/artist${i}.jpg` : null,
  421 |       isVerified: i === 0,
  422 |     }));
  423 | 
  424 |     await mockProfileResponse(page, {
  425 |       id: "user-scroll",
  426 |       username: "scrollexplorer",
  427 |       avatarUrl: "https://example.com/avatar.jpg",
  428 |       registrationYear: 2023,
  429 |       playlists: [],
  430 |       followedArtists,
  431 |     });
  432 | 
  433 |     await page.goto(PROFILE_URL);
  434 | 
  435 |     const carousel = page.getByTestId("followed-artists-carousel");
  436 |     await expect(carousel).toBeVisible();
  437 | 
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
```