# RenderLess (Milestones 1-8)

RenderLess is a broadcast graphics prototype with three surfaces:

- `Stage Pro` (`/design`) for template authoring.
- `Control Room` (`/control-room`) for preview/program playout.
- `Output Feed` (`/output-feed?follow=preview|program&embed=1`) as the canonical render target.

## Run

```bash
npm install
npm run dev
```

## Cross-Device Transport (V1.1)

RenderLess supports two playout sync transports:

- `Local` (default): `BroadcastChannel + localStorage`.
- `WebSocket`: cross-device snapshot transport.

Start the relay:

```bash
npm run transport:relay
```

Default relay URL is `ws://localhost:8787`.
Set transport mode/URL in Control Room under **Cross-Device Transport**.

### Rooms

Relay traffic is scoped to a room so only screens sharing a code see each other.
Each browser gets a random room code (shown in Control Room as `ROOM ...`), and
**Copy Program/Preview URL** includes it as `?room=`. Output feed pages are
receive-only: they mirror the room's controller and never publish state.

### Hosted relay (Cloudflare)

The GitHub Pages build connects to a Cloudflare Worker relay in `relay/`
(one Durable Object per room, free plan).

Pushing changes under `relay/` to `main` redeploys it automatically via
`.github/workflows/deploy-relay.yml`. That needs a `CLOUDFLARE_API_TOKEN`
repo secret (a Cloudflare API token from the "Edit Cloudflare Workers"
template) and the `CLOUDFLARE_ACCOUNT_ID` repo variable. To deploy by hand:

```bash
cd relay
npm install
npx wrangler deploy
```

Allowed browser origins are set by `ALLOWED_ORIGINS` in `relay/wrangler.jsonc`.
The Pages build picks up the relay via `VITE_RELAY_URL` in
`.github/workflows/deploy-pages.yml`.

## Template Package Contract (V2)

Template package kind:

- `renderless.template-package`

Contract:

- v2: `scenegraph + bindings + metadata + integrity`

Integrity hardening:

- deterministic checksum (`fnv1a-32`) on canonical package payload
- optional shared-secret signature (`fnv1a-32-hmac-lite`)

Migration tooling:

- legacy template object -> v1 -> v2
- v1 package -> v2 package

Package signing can be configured in Dashboard under **Package Signing**.

## QA

```bash
npm run lint
npm run build
npm run test
```
