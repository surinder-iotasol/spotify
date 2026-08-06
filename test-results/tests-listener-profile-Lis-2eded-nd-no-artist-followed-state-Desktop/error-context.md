# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/listener-profile.spec.ts >> Listener Profile — Page Load (AC1) >> renders empty playlists and no-artist-followed state
- Location: e2e/tests/listener-profile.spec.ts:182:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('empty-playlists')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('empty-playlists')

```

```yaml
- heading "404" [level=1]
- heading "This page could not be found." [level=2]
- alert
```

# Test source

```ts
  98  |           isVerified: true,
  99  |         },
  100 |         {
  101 |           id: "ap-2",
  102 |           displayName: "Neon Drift",
  103 |           avatarUrl: null,
  104 |           isVerified: false,
  105 |         },
  106 |       ],
  107 |     });
  108 | 
  109 |     await page.goto(PROFILE_URL);
  110 | 
  111 |     // Profile header should be visible
  112 |     await expect(page.getByTestId("profile-header")).toBeVisible();
  113 | 
  114 |     // Username should display
  115 |     await expect(page.getByTestId("profile-username")).toContainText("groovemaster");
  116 | 
  117 |     // Playlists grid should be visible with correct heading
  118 |     const grid = page.getByTestId("playlists-grid");
  119 |     await expect(grid).toBeVisible();
  120 | 
  121 |     const heading = page.getByTestId("playlists-heading");
  122 |     await expect(heading).toContainText("Public Playlists (2)");
  123 | 
  124 |     // Followed artists carousel should be visible
  125 |     const carousel = page.getByTestId("followed-artists-carousel");
  126 |     await expect(carousel).toBeVisible();
  127 | 
  128 |     const carouselHeading = page.getByTestId("followed-artists-heading");
  129 |     await expect(carouselHeading).toContainText("Followed Artists (2)");
  130 |   });
  131 | 
  132 |   test("shows error state when profile API returns 404", async ({ page }) => {
  133 |     await mockProfileNotFound(page);
  134 |     await page.goto(PROFILE_URL);
  135 | 
  136 |     // Next.js notFound() should trigger the 404 page. In our test setup
  137 |     // the page will show the Next.js error boundary or a not-found message.
  138 |     // We check that the original profile elements are NOT rendered.
  139 |     await expect(page.getByTestId("profile-header")).not.toBeVisible();
  140 |     await expect(page.getByTestId("playlists-grid")).not.toBeVisible();
  141 |   });
  142 | 
  143 |   test("renders loading state before API response completes", async ({
  144 |     page,
  145 |   }) => {
  146 |     // Intercept and delay the response so we can check loading UI.
  147 |     await page.route(
  148 |       "**/api/v1/users/test-user-1",
  149 |       async (route) => {
  150 |         // Fulfill after a short delay to simulate network latency.
  151 |         setTimeout(async () => {
  152 |           await route.fulfill({
  153 |             status: 200,
  154 |             contentType: "application/json",
  155 |             body: JSON.stringify({
  156 |               success: true,
  157 |               data: {
  158 |                 id: "user-1",
  159 |                 username: "groovemaster",
  160 |                 avatarUrl: "https://example.com/avatar.jpg",
  161 |                 registrationYear: 2022,
  162 |                 playlists: [],
  163 |                 followedArtists: [],
  164 |               },
  165 |             }),
  166 |           });
  167 |         }, 500);
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
> 198 |     await expect(empty).toBeVisible();
      |                         ^ Error: expect(locator).toBeVisible() failed
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
  268 |     await expect(card).toBeVisible();
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
```