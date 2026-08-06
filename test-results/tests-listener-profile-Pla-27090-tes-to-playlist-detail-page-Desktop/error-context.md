# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/listener-profile.spec.ts >> Playlist Card Navigation — AC2 >> clicking a playlist card navigates to playlist detail page
- Location: e2e/tests/listener-profile.spec.ts:245:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('playlist-card-pl-roadtrip')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('playlist-card-pl-roadtrip')

```

```yaml
- heading "404" [level=1]
- heading "This page could not be found." [level=2]
- alert
```

# Test source

```ts
  168 |       },
  169 |     );
  170 | 
  171 |     await page.goto(PROFILE_URL);
  172 | 
  173 |     // Within the first 300ms the page should either show a loading skeleton
  174 |     // or the profile header. Since our server component fetches data, the
  175 |     // page may render after the fetch resolves. We just verify the page
  176 |     // doesn't hang indefinitely.
  177 |     await expect(page.getByTestId("profile-username")).toBeVisible({
  178 |       timeout: 5000,
  179 |     });
  180 |   });
  181 | 
  182 |   test("renders empty playlists and no-artist-followed state", async ({
  183 |     page,
  184 |   }) => {
  185 |     await mockProfileResponse(page, {
  186 |       id: "user-empty",
  187 |       username: "solo-listener",
  188 |       avatarUrl: null,
  189 |       registrationYear: 2024,
  190 |       playlists: [],
  191 |       followedArtists: [],
  192 |     });
  193 | 
  194 |     await page.goto(PROFILE_URL);
  195 | 
  196 |     // Empty playlists state should be visible
  197 |     const empty = page.getByTestId("empty-playlists");
  198 |     await expect(empty).toBeVisible();
  199 |     await expect(empty).toContainText("No public playlists yet.");
  200 | 
  201 |     // No followed artists message should be visible
  202 |     await expect(page.getByText("No followed artists yet.")).toBeVisible();
  203 |   });
  204 | });
  205 | 
  206 | /* ------------------------------------------------------------------ */
  207 | /*  AC2: Clicking a playlist card navigates to playlist detail        */
  208 | /* ------------------------------------------------------------------ */
  209 | 
  210 | test.describe("Playlist Card Navigation — AC2", () => {
  211 |   test("playlist card anchor has correct href to playlist detail page", async ({
  212 |     page,
  213 |   }) => {
  214 |     await mockProfileResponse(page, {
  215 |       id: "user-1",
  216 |       username: "groovemaster",
  217 |       avatarUrl: "https://example.com/avatar.jpg",
  218 |       registrationYear: 2022,
  219 |       playlists: [
  220 |         {
  221 |           id: "pl-workout",
  222 |           title: "Workout Bangers",
  223 |           coverImageUrl: "https://example.com/pl1.jpg",
  224 |           trackCount: 25,
  225 |           isPublic: true,
  226 |         },
  227 |       ],
  228 |       followedArtists: [],
  229 |     });
  230 | 
  231 |     await page.goto(PROFILE_URL);
  232 | 
  233 |     const card = page.getByTestId("playlist-card-pl-workout");
  234 |     await expect(card).toBeVisible();
  235 | 
  236 |     const link = card.locator("a");
  237 |     await expect(link).toBeVisible();
  238 |     await expect(link).toHaveAttribute("href", "/playlists/pl-workout");
  239 |     await expect(link).toHaveAttribute(
  240 |       "aria-label",
  241 |       "Playlist: Workout Bangers with 25 tracks",
  242 |     );
  243 |   });
  244 | 
  245 |   test("clicking a playlist card navigates to playlist detail page", async ({
  246 |     page,
  247 |   }) => {
  248 |     await mockProfileResponse(page, {
  249 |       id: "user-1",
  250 |       username: "groovemaster",
  251 |       avatarUrl: "https://example.com/avatar.jpg",
  252 |       registrationYear: 2022,
  253 |       playlists: [
  254 |         {
  255 |           id: "pl-roadtrip",
  256 |           title: "Road Trip Mix",
  257 |           coverImageUrl: "https://example.com/road.jpg",
  258 |           trackCount: 42,
  259 |           isPublic: true,
  260 |         },
  261 |       ],
  262 |       followedArtists: [],
  263 |     });
  264 | 
  265 |     await page.goto(PROFILE_URL);
  266 | 
  267 |     const card = page.getByTestId("playlist-card-pl-roadtrip");
> 268 |     await expect(card).toBeVisible();
      |                        ^ Error: expect(locator).toBeVisible() failed
  269 | 
  270 |     // Intercept the navigation to the playlist page to prevent 404 errors
  271 |     // since the playlist detail page may not exist in tests.
  272 |     // We just verify the navigation target is correct.
  273 |     await page.route("**/playlists/pl-roadtrip*", async (route) => {
  274 |       await route.fulfill({
  275 |         status: 200,
  276 |         contentType: "text/html",
  277 |         body: "<html><body>Playlist Detail</body></html>",
  278 |       });
  279 |     });
  280 | 
  281 |     // Click the card link
  282 |     const link = card.locator("a");
  283 |     const [response] = await Promise.all([
  284 |       page.waitForNavigation({ url: "**/playlists/pl-roadtrip**", timeout: 5000 }),
  285 |       link.click(),
  286 |     ]);
  287 | 
  288 |     // Verify we navigated to the playlist detail page
  289 |     expect(page.url()).toContain("/playlists/pl-roadtrip");
  290 |   });
  291 | 
  292 |   test("playlist card is keyboard-focusable and clickable via Enter", async ({
  293 |     page,
  294 |   }) => {
  295 |     await mockProfileResponse(page, {
  296 |       id: "user-1",
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
```