# unishare → uniauth (phase 4)

> **Superseded** by [`planning-oidc.md`](./planning-oidc.md) (central login + OAuth session per app). Kept for the verification notes and findings below.

Move unishare off its in-process Better Auth onto **uniauth** (`auth.psstee.dev`), the shared
identity service for unishare and unigym. Signing in to one app signs you in to all of them.

Status: **implemented on `feat/uniauth`, verified locally in both modes (2026-09-28); not merged.**
Includes phase 3 (MCP via uniauth, `MCP_AUTH_ISSUER`).

## As built (deviations from the plan below)

- `src/auth/session/` instead of `src/auth/uniauth/`: `AuthSessionService` is global in **both**
  modes (gateways, collab guests, set-password, delete, identity edits go through it);
  `UniauthGuard` is only registered when `AUTH_MODE=uniauth`.
- `main.ts` unchanged: the `api/(.*)` prefix exclusion is harmless without Better Auth.
- **Body parsing:** `@thallesp/nestjs-better-auth`'s `AuthModule` also installs `express.json()` +
  `urlencoded()` for every route (Nest's parser is off for Better Auth). `AuthSessionModule`
  re-adds them in uniauth mode — without it every request body is empty.
- `PATCH /users/me` pushes `name` / `image` to uniauth `update-user` first (identity fields), or
  the next session sync would undo the edit.
- Set-password goes through a new uniauth route `POST /api/account/set-password` (Better Auth's
  `setPassword` is server-only); it checks the Origin against uniauth's trusted origins.
- Admin routes are used by the web in **both** modes. In legacy mode a ban also deletes the
  user's Better Auth sessions (parity with `admin.banUser`).
- SDK ships ESM + CJS (`dist/index.cjs` for `require`), so Nest/Jest load it directly.
- The SDK is linked (`link:../../../uniauth/packages/sdk`) until `0.1.0` is published to GitHub
  Packages — **must be switched to the registry version before merge** (CI can't resolve the link).

## Verified locally (uniauth :3002, unishare API :3001, web :3000, DB `unishare_uniauth`)

uniauth mode: 401 signed-out; first visit provisions the local user; verified KMUTT member →
KMUTT; optional routes signed-out; admin list / ban (403 + optional routes signed-out + socket
rejected) / unban / role / self-ban refused; rename syncs to uniauth; guest collab join issues a
uniauth guest and relays the cookie; MCP 401 + protected-resource metadata, uniauth token lists
scoped tools, tampered token 401; chat/collab sockets accept the cookie; self-delete removes the
uniauth identity and the local row; web `/login` and protected pages redirect to uniauth.
Legacy mode: sign-up, `/users/me`, PATCH bodies, admin list, sockets unchanged.

## Found during verification — affects phase 5+

- **Web auth mode is build-time.** `Dockerfile.web` bakes `NEXT_PUBLIC_*` into the image, so
  `NEXT_PUBLIC_AUTH_MODE` can't be flipped with an env change. The API and web must switch
  together: build a uniauth-mode web image (new build arg) and roll both at cutover. Rollback is
  "redeploy the previous web image + set the API back to legacy", not an env flip — a legacy web
  build against a uniauth-mode API sends `/login` to `/api/auth`, which 404s.
- **Open sockets are not re-checked** after a ban or sign-out — in **either** mode (verified: in
  legacy, deleting the session leaves the socket connected and accepting events). Pre-existing;
  the handshake does reject banned users. Fix later by disconnecting a user's sockets on ban.
- **Consent on first visit:** provisioning sets `consentGivenAt = now`, which is only true for
  people who signed up from unishare's branded uniauth page. Someone who signed up via unigym and
  then opens unishare never saw unishare's terms. Before unigym launches: leave it null on
  provisioning and ask in unishare onboarding.
- Calls to uniauth time out (SDK session lookup 3s, account actions 5s), so a hung uniauth
  degrades to 503 / signed-out optional routes instead of hanging requests.

Not covered: set-password on a social-only account (no social provider configured locally),
account-page actions in a real browser, the new uniauth pages visually.

## Overview

| Today                                                     | After phase 4 (`AUTH_MODE=uniauth`)                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| NestJS runs Better Auth (`auth.config.ts`) at `/api/auth` | uniauth runs Better Auth; unishare only **reads** the shared cookie             |
| `@thallesp/nestjs-better-auth` global guard               | `UniauthGuard` — same metadata keys, so **no controller changes**               |
| Roles, bans, profile on Better Auth's `user`              | Same columns on unishare's `User`, owned by unishare                            |
| `/login` page in unishare                                 | Redirect to `auth.psstee.dev/login?redirect=…`                                  |
| `University.users`                                        | `University.uniauthOrgId` ↔ uniauth organization; membership comes from uniauth |

`AUTH_MODE=legacy` (default) keeps today's behaviour byte-for-byte. The flag is flipped at the
phase 5 cutover and removed, with Better Auth, in phase 7.

## Decisions (agreed)

- Shared session cookie on `.psstee.dev`; unishare validates it by calling uniauth
  `/api/auth/get-session`, cached in Redis for 60s (cache keyed by a hash of the token).
- Identity (name, email, image, password, social accounts) lives in uniauth. Roles, bans,
  department, E2EE keys, bio stay in unishare's `User`, keyed by the same user id.
- Universities are uniauth organizations. unishare keeps its `University` table (departments,
  courses hang off it) and links it with `uniauthOrgId`.
- Guests are issued by uniauth; unishare accepts `isAnonymous` users as today.
- **Ban** = unishare only (local `banned` / `banReason` / `banExpires`).
- **Admin remove** = unishare data only. **User self-delete** = unishare data + the uniauth
  identity (every app), behind an explicit warning.
- Terms consent is recorded per app: unishare sets `consentGivenAt` on first arrival.

## Architecture

```
browser ──cookie better-auth.session_token (.psstee.dev)──▶ unishare API
                                                              │
                        UniauthGuard / socket middleware      │
                          1. read cookie                      │
                          2. Redis cache hit? ──yes──▶ session│
                          3. GET uniauth /api/auth/get-session (forward cookie)
                          4. provision/refresh local User row │
                          5. merge local role/departmentId/ban into session.user
                          6. PUBLIC / OPTIONAL / ROLES checks (same keys as @thallesp)
```

`request.session` keeps the Better Auth shape `{ session, user }`, with `user.role`,
`user.departmentId`, `user.universityId` filled from the local row, so the 101 `@Session()`
call sites and `session.user.role` checks (14) work unchanged.

**Provisioning:** first authenticated request for an unknown user id creates the local `User`
(`id`, `name`, `email`, `image`, `isAnonymous`, `role = STUDENT`, `consentGivenAt = now`,
`universityId` from the verified-or-picked uniauth membership). Later requests update
`name`/`email`/`image` when they differ (identity edits happen in uniauth).

**Bans:** a banned local user gets `403` on authenticated routes and a rejected socket
handshake — same as the admin plugin today.

## SDK — `@unishare-oss/uniauth-sdk` (in the uniauth repo)

Framework-agnostic, used by unishare now and unigym later:

```ts
const uniauth = createUniauthClient({
  baseURL: 'https://auth.psstee.dev',
  cookiePrefix: 'better-auth', // 'uniauth-dev' in the dev cluster
  cache: { get, set, del }, // e.g. ioredis adapter; optional
  cacheTtlSeconds: 60,
})
await uniauth.getSession(headers) // → UniauthSession | null
await uniauth.invalidate(headers) // on sign-out / ban
```

The uniauth session gains `user.organizations: { id, verified }[]` (Better Auth
`customSession`) so apps don't need a second call for memberships.

Delivery: GitHub Packages (`@unishare-oss` scope) from uniauth CI. Until the first publish,
unishare consumes it with `pnpm link` locally.

## Data model changes (unishare Prisma)

```prisma
model University {
  // …existing
  uniauthOrgId String? @unique   // uniauth organization id
}
```

No other schema change in phase 4. `User` already has `role`, `banned`, `banReason`,
`banExpires`, `departmentId`, `universityId`, `consentGivenAt`, `isAnonymous`. Better Auth's
`session` / `account` / `verification` / `oauth_*` tables stay until phase 7.

## API changes

| Endpoint / call                                            | uniauth mode                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| Better Auth `/api/auth/*` in NestJS                        | not mounted (AuthModule not imported)                                      |
| `auth.api.getSession` in chat + collab gateways            | `UniauthService.getSession(headers)`                                       |
| `auth.api.signInAnonymous` (`collab.service.ts:158`)       | `POST uniauth /api/auth/sign-in/anonymous`, relay `Set-Cookie`             |
| `auth.api.setPassword` (`users.controller.ts:53`)          | proxied to uniauth `/api/auth/set-password` with the caller's cookie       |
| **new** `GET /api/users/admin/list`                        | replaces `authClient.admin.listUsers` (local `User` query, paginated)      |
| **new** `POST /api/users/admin/:id/ban`, `/unban`, `/role` | local columns                                                              |
| **new** `DELETE /api/users/admin/:id`                      | unishare data only                                                         |
| **new** `DELETE /api/users/me` (self-delete)               | delete unishare data, then uniauth `/api/auth/delete-user` with the cookie |

Admin routes sit in the users module next to the existing `users/admin/public-keys` routes.

## Web changes (`apps/web`)

- `src/lib/auth/client.ts`: `baseURL = NEXT_PUBLIC_AUTH_URL` in uniauth mode; drop
  `inferAdditionalFields` role/department fields (they come from `/users/me`), drop `adminClient`.
- `/login` → redirect to `${AUTH_URL}/login?redirect=<current url>`; guests via uniauth.
- `proxy.ts`: `getSessionCookie(request, { cookiePrefix })` from `NEXT_PUBLIC_AUTH_COOKIE_PREFIX`.
- Admin page: `authClient.admin.*` → the new `/api/admin/users*` Orval hooks.
- Account page: `changePassword`, `linkSocial`, `listAccounts`, `unlinkAccount` keep working via
  the client (now pointed at uniauth); `deleteUser` → `DELETE /api/users/me` + warning copy.
- `QuizGame.tsx:31`: `session.user.role` → `user.role` from `useAuth()`.
- Signup's university picker moves to uniauth (`/select-university`); unishare's profile page
  keeps "change university" by calling uniauth `/api/orgs/join` (only when no membership) —
  otherwise shows the verified university read-only.

## Files touched

**unishare `apps/api`**

- `src/auth/auth-mode.ts` — **new**: `AUTH_MODE` parse + env validation
- `src/auth/uniauth/uniauth.module.ts` — **new**: provides client, guard (`APP_GUARD`), service
- `src/auth/uniauth/uniauth.guard.ts` — **new**: PUBLIC/OPTIONAL/ROLES + ban check
- `src/auth/uniauth/uniauth.service.ts` — **new**: getSession, provisioning, profile merge, Redis cache
- `src/auth/uniauth/*.spec.ts` — **new**
- `src/app.module.ts` — import `AuthModule.forRoot` or `UniauthModule` by mode
- `src/main.ts` — Better Auth `/api/(.*)` prefix exclusion only in legacy mode
- `src/modules/chat/chat.gateway.ts`, `src/modules/collab/collab.gateway.ts` — session lookup via a shared `resolveSocketSession()` helper
- `src/modules/collab/collab.service.ts` — anonymous sign-in by mode
- `src/modules/users/users.controller.ts`, `users.service.ts`, `users.repository.ts` — `setPassword` + self-delete by mode; admin list / ban / unban / role / remove
- `src/modules/users/dto/*`, `entities/*`, specs — **new** DTOs/entities for the admin routes
- `prisma/schema.prisma` + migration — `University.uniauthOrgId`
- `.env.example` — `AUTH_MODE`, `UNIAUTH_URL`, `UNIAUTH_COOKIE_PREFIX`

**unishare `apps/web`**

- `src/lib/auth/client.ts`, `proxy.ts`, `app/(auth)/login/page.tsx`
- `app/(app)/(protected)/admin/users/page.tsx`, `components/admin/users/users-table.tsx` — admin actions
- `app/(app)/(protected)/profile/page.tsx`, `components/profile/change-password-form.tsx`,
  `connected-accounts-card.tsx`, `danger-zone-card.tsx` — account actions
- `components/app-rail.tsx`, `components/mobile-nav.tsx` — sign-out goes to uniauth `/logout?redirect=`
- `components/quiz/QuizGame.tsx`
- `.env.example` — `NEXT_PUBLIC_AUTH_MODE`, `NEXT_PUBLIC_AUTH_URL`, `NEXT_PUBLIC_AUTH_COOKIE_PREFIX`

**uniauth**

- `packages/sdk/src/*` — client, cache adapter interface, tests; publish workflow
- `apps/server/src/auth/auth.ts` — `customSession` adding `user.organizations`
- `apps/server/src/routes/orgs.ts` — `/api/orgs/join` accepts cross-origin calls from registered apps (already CORS-allowed)

No change to the 24 controllers using `@Session()` / `@OptionalAuth()` / `@Roles()`.

## Step-by-step

1. SDK: `createUniauthClient` + cache adapter + tests (uniauth repo). ~2h
2. uniauth: `customSession` with organizations. ~30m
3. unishare API: `auth-mode.ts`, `UniauthModule` (guard + service + provisioning), specs. ~4h
4. Gateways + collab anonymous + setPassword + self-delete by mode. ~2h
5. Admin routes in the users module (list / ban / unban / role / remove) + Orval regen. ~3h
6. Prisma `uniauthOrgId` migration. ~20m
7. Web: client, proxy, login redirect, admin page, account page, QuizGame. ~3h
8. Local end-to-end: unishare (:3000/:3001) + uniauth (:3002), both modes, all four flows
   (password, social, guest, MCP). ~2h

Total: about 2 days.

## Trade-offs

- **Remote session check vs. local JWT:** a network hop to uniauth on cache miss, in exchange
  for bans/sign-outs applying within 60s. Redis is already required by unishare.
- **Same metadata keys as `@thallesp`:** zero controller churn now; the decorator imports move
  to a local file in phase 7 when the package is removed.
- **Lazy provisioning vs. sync webhook:** no extra infra; downside — a user deleted directly in
  uniauth (e.g. from unigym) leaves an orphaned unishare row. Tracked below.

## Risks / open items

- **Deletion from another app** leaves unishare data behind. Options for later: uniauth
  `user.deleted` webhook to registered apps, or a nightly reconcile. Not in phase 4.
- **`BETTER_AUTH_SECRET` must match** between unishare (legacy) and uniauth prod so migrated
  sessions stay valid at cutover (phase 5).
- **Cross-origin account actions** (`changePassword` etc. from `share.psstee.dev` to
  `auth.psstee.dev`) rely on uniauth's CORS allow-list and `SameSite=Lax` cookies on the shared
  parent domain — same-site, so the cookie is sent.
- The 46 pre-existing failures in `chat.service.spec.ts` / `collab.*.spec.ts` (missing
  `StorageService` in the test module) are not addressed here.
