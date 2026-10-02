# RenderLess project notes

- **Brand guidelines are the source of truth.** For every task, first sweep
  `brand/guidelines/majordems_complete_design.md` (and `brand/guidelines/majordems_brand_colors.md`)
  and make sure the plan follows them. Flag conflicts before building.
- `brand/` is local-only (git-ignored except `brand/README.md`). Never commit logos or
  guidelines from it.
- UI styling mirrors the basIQ Studio Hub app (`C:/dev/basiq-studio-web/app/globals.css`):
  same tokens, font roles and component styles. The web fonts in `public/fonts/` and the
  wordmark in `public/brand/` are the same files basIQ already serves publicly (user's
  decision); add other brand assets only if the user asks.
