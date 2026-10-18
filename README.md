# TryOn Compare — judging app

- [Open the fitting room](https://tryon-compare.dgrrgddgrrgd.chatgpt.site/) — live try-on requires the access code provided with the submission.
- [Open the recorded example](https://tryon-compare.dgrrgddgrrgd.chatgpt.site/?replay=1) — two previously generated real YouCam results; no new generation.
- [Watch the demo video](https://youtu.be/W80d5jWSDKA).

On 18 October 2026, a production browser check passed through sign-in, photo selection, explicit consent, one live task, same-origin result-image decoding, comparison notes, and reload. A second signed-in session received 404 for the first session's task and result. The official read-only unit check confirmed a 2-unit reduction. The repeated fictional person/navy inputs returned the same JPEG as the recorded navy example; the new live request did not produce a different visual variant. This check does not measure physical fit or guarantee ongoing generation capacity.

This local Sites/Vinext app preserves the original fitting-room interface and adds password-protected server-side YouCam access. The parent app is unchanged. Starter documentation is preserved in `README.starter.md`.

The project's original application code is released under the [MIT License](LICENSE), with the owner's approval on 18 October 2026. Existing third-party notices remain in `build/sites-vite-plugin.LICENSE` and `vendor/shadcn-tailwind-4.13.0.LICENSE.md`; dependencies retain their own licenses. Demonstration provenance, provider conditions and asset limitations are documented in [Rights and privacy](RIGHTS_AND_PRIVACY.en.md). The code license does not relicense provider technology or third-party materials.

`/` opens the normal fitting room; `/judge` accepts the access code supplied with the submission. `/?replay=1` opens two previously generated real YouCam results, explicitly labeled as recorded. Replay makes no generation requests. Three fictional AI-created input photos are available as downloads. Judges do not need their own YouCam account or API key.

## Configuration

Configure these names in the native Sites environment. Never put actual secrets in source, browser code, screenshots, archives or Git.

| Variable | Purpose |
| --- | --- |
| `JUDGE_PASSWORD` | Secret access code, at least 16 characters; use a strong random value. Rotation invalidates sessions. |
| `YOUCAM_API_KEY` | Secret, server-only provider key. |
| `YOUCAM_ENABLE_UPLOAD` | Must be exactly `true` to enable authenticated live requests; otherwise off. |
| `SERVER_UNIT_LIMIT` | Server-only cumulative cap, default 32 units. Positive even integer up to 1,000,000; invalid values disable capacity. |

The hosting manifest binds D1 as `DB`; no R2 is used. Platform private-site access is separate from this live-API password gate. Local verification does not prove published access, a provider grant, an available real balance, or final submission.

## Spending, privacy and access

Each accepted task reserves **2 units** in one atomic D1 write **before** any provider file upload or task creation. The default 32-unit cap permits at most 16 attempts. Failed or expired attempts remain charged in this ledger; no refund, automatic retry or cap reset occurs. This conservative allowance is not a provider balance meter. The project owner must verify real available credits separately before increasing it. Clients cannot choose the key, owner, provider transport or cap.

Sessions last eight hours. HTTPS cookies use `__Host-`, Secure, HttpOnly, SameSite=Strict, Path=/ and no Domain. Local loopback HTTP uses a separate local-only cookie name. Task polling and result image access require the owning session. Mutations require same-origin requests and a per-session CSRF token. Login attempts are limited to eight per fifteen minutes per HMAC-hashed network address; raw addresses are not stored.

Task access expires thirty minutes after reservation. **On the next API request after expiry**, cleanup clears private provider task IDs and result URLs. The charged ledger row, owner hash, ID, timestamps and units remain. Expired sessions are deleted during request cleanup. Cleanup is not a scheduled deletion service and does not delete files held by YouCam.

Photos pass through the server to YouCam and are not stored in D1. Results are streamed through an owner-checked proxy; private provider IDs and signed URLs are not returned to the client. Only allowlisted HTTPS provider storage hosts are accepted, without redirects. Browser notes persist only the metadata allowlist, excluding photos, task IDs and result links. Clearing the board does not delete provider files. The linked YouCam API terms generally provide thirty-day provider retention, controlled by provider terms and settings.

JPEG/PNG input files are limited to 8 MiB each, at least 512 × 384 in either orientation, with no side above 4096. The browser actually decodes selected images. Server validation checks MIME, base64, byte size and header dimensions; it is **not a complete server-side image decoder or content moderation system**. Results are appearance references, not physical fit or size measurements.

## Install, build and local preview

Node 24 is used for tests (`node:sqlite`); the starter requires Node >=22.13.0. Preserve `sites()` and the supplied build integration.

```sh
npm run install:ci
npm run build
node node_modules/typescript/bin/tsc --noEmit
node --test test/judging.test.mjs
```

On this Windows host, the plugin npm wrapper resolved a nonexistent project-local npm CLI. The existing installed npm CLI worked directly, without changing system shims:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run build
```

Apply each pending generated migration once, in order, to a new **local** database after building. Never edit or replay an already applied migration.

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_flimsy_kat_farrell.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_grey_calypso.sql
npm start -- --port 9050
```

Remote migrations and deployment are separate owner-authorized actions. Without local secrets, live generation remains off and recorded mode still works. `public/index.html` is intentionally absent: it would shadow the dynamic root route and omit judge links and the hosted consent notice. Its unchanged source is preserved in `assets/original-index.html`; the served source is `assets/fitting-room.html` plus the small root-route additions.

## Verification and packaging

`test/judging.test.mjs` uses fake credentials and an in-memory provider transport. It covers anonymous access, cookies, origin/CSRF, input limits, owner isolation, private result proxying, charged failures, existing-task lookup, expiry cleanup, logout/password rotation and cap enforcement. Twelve real SQLite connections attempt 48 reservations and verify that only 16 / 32 units are accepted.

With Playwright installed, `node test/browser-qa.mjs` uses an isolated browser against the built local preview on 9050 and a loopback-only offline transport fixture. The fixture has a conspicuous offline-test label, fake credentials, and no real network transport. It exercises file decoding, consent, the preserved provider adapter protocol, result proxying and note persistence. Its success is local adapter/UI integration evidence, not a new provider result. Screenshots and reports are under ignored `.qa/`.

These tests do not call the real provider, spend credits, upload, publish or submit. Keep `.env`, `.dev.vars`, `.sites-runtime`, `.wrangler`, `.qa`, `node_modules` and private evidence out of source packages. `.env.example` contains variable names and safe defaults only. This reusable source package omits the owner Site ID. Local preview works independently; register your own Site only if you choose to deploy your own copy.

`test/judge-form-origin.mjs` checks native form Origin preservation against a built app using an invalid fixture access code. `test/provider-worker-runtime.mjs` runs the actual provider adapter in Miniflare/workerd with every outbound request handled by local fixtures, including rejected redirects. Neither regression test creates a real provider task.

For an existing Playwright runtime or browser installation, pass --playwright-module and --browser-executable paths to the browser QA command. No host-specific account path is embedded in the public test runner.

