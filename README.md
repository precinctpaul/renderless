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
