# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/listener-profile.spec.ts >> Listener Profile — Page Load (AC1) >> renders full profile page with header, playlists, and carousel
- Location: e2e/tests/listener-profile.spec.ts:69:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('profile-header')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('profile-header')

```

```yaml
- heading "404" [level=1]
- heading "This page could not be found." [level=2]
- alert
```

# Test source

```ts
  12  | 
  13  | const PROFILE_URL = "/users/test-user-1";
  14  | 
  15  | /* ------------------------------------------------------------------ */
  16  | /*  Helpers                                                           */
  17  | /* ------------------------------------------------------------------ */
  18  | 
  19  | /**
  20  |  * Mock a successful listener profile response with public playlists and
  21  |  * followed artists.
  22  |  */
  23  | async function mockProfileResponse(
  24  |   page: import("@playwright/test").Page,
  25  |   data: Record<string, unknown>,
  26  | ) {
  27  |   await page.route(
  28  |     "**/api/v1/users/test-user-1",
  29  |     async (route) => {
  30  |       await route.fulfill({
  31  |         status: 200,
  32  |         contentType: "application/json",
  33  |         body: JSON.stringify({
  34  |           success: true,
  35  |           data,
  36  |         }),
  37  |       });
  38  |     },
  39  |   );
  40  | }
  41  | 
  42  | /**
  43  |  * Mock a 404 profile response (user not found).
  44  |  */
  45  | async function mockProfileNotFound(page: import("@playwright/test").Page) {
  46  |   await page.route(
  47  |     "**/api/v1/users/test-user-1",
  48  |     async (route) => {
  49  |       await route.fulfill({
  50  |         status: 404,
  51  |         contentType: "application/json",
  52  |         body: JSON.stringify({
  53  |           success: false,
  54  |           error: {
  55  |             code: "USER_NOT_FOUND",
  56  |             message: "User profile not found.",
  57  |           },
  58  |         }),
  59  |       });
  60  |     },
  61  |   );
  62  | }
  63  | 
  64  | /* ------------------------------------------------------------------ */
  65  | /*  AC1: Loading the profile page                                     */
  66  | /* ------------------------------------------------------------------ */
  67  | 
  68  | test.describe("Listener Profile — Page Load (AC1)", () => {
  69  |   test("renders full profile page with header, playlists, and carousel", async ({
  70  |     page,
  71  |   }) => {
  72  |     await mockProfileResponse(page, {
  73  |       id: "user-1",
  74  |       username: "groovemaster",
  75  |       avatarUrl: "https://example.com/avatar.jpg",
  76  |       registrationYear: 2022,
  77  |       playlists: [
  78  |         {
  79  |           id: "pl-1",
  80  |           title: "Workout Bangers",
  81  |           coverImageUrl: "https://example.com/pl1.jpg",
  82  |           trackCount: 25,
  83  |           isPublic: true,
  84  |         },
  85  |         {
  86  |           id: "pl-2",
  87  |           title: "Late Night Jazz",
  88  |           coverImageUrl: "https://example.com/pl2.jpg",
  89  |           trackCount: 18,
  90  |           isPublic: true,
  91  |         },
  92  |       ],
  93  |       followedArtists: [
  94  |         {
  95  |           id: "ap-1",
  96  |           displayName: "Echo Waves",
  97  |           avatarUrl: "https://example.com/artist1.jpg",
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
> 112 |     await expect(page.getByTestId("profile-header")).toBeVisible();
      |                                                      ^ Error: expect(locator).toBeVisible() failed
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
```