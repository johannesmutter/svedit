# AGENTS.md

## Cursor Cloud specific instructions

Svedit is a Svelte 5 rich content editor library with a SvelteKit demo app. Single `package.json` at root; no external services, databases, or Docker required.

### Quick reference

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Unit tests | `npm run test` (runs vitest with `--run`) |
| Lint | `npm run lint` (prettier + eslint) |
| Type check | `npm run check` (svelte-check) |
| Format | `npm run format` |

See `CLAUDE.md` for full command list and architecture overview.

### Gotchas

- **Unit tests use `@vitest/browser-preview`** with Chromium in non-headless mode. Tests require a GUI display (`$DISPLAY` must be set). They work in Cursor Cloud VMs where X11 is available. The browser window opens automatically when running `npm run test`.
- **ESLint config has a pre-existing issue**: the `@typescript-eslint/ban-types` rule no longer exists in the installed version of `@typescript-eslint/eslint-plugin`. Running `npx eslint .` will error on this. This is a known issue in the repo, not an agent-caused problem.
- **Prettier reports formatting warnings** on several files (pre-existing). `npm run lint` will exit non-zero due to these warnings.
- The dev server runs on port 5173 by default. Use `npm run dev -- --host 0.0.0.0` to expose to network.
