Title: Tailwind CLI "could not determine executable to run"

Summary
-------

When running `npx tailwindcss init -p` the command failed with the npm error:

```
npm error could not determine executable to run
```

Log location (example): `/home/codespace/.npm/_logs/<timestamp>-debug-0.log`

Root cause
----------

- Recent Tailwind package (v4.x) no longer exposes a `bin` executable in its package.json. When `npm exec`/`npx` tries to resolve a binary it expects a `bin` entry; without it npm reports "could not determine executable to run".

Mitigations / Workarounds
-------------------------

1. Install Tailwind and PostCSS locally and let Vite/PostCSS process Tailwind during dev/build (no CLI required):

   ```bash
   npm install -D tailwindcss postcss autoprefixer
   # (we already added `postcss.config.cjs` and `tailwind.config.cjs` in the repo)
   npm run dev
   ```

2. If you need the CLI `tailwindcss init -p` behavior, use the v3 CLI specifically:

   ```bash
   npx --package tailwindcss@3 tailwindcss init -p
   # or
   npm install -D tailwindcss@^3 postcss autoprefixer
   npx tailwindcss init -p
   ```

3. Manual creation (what I applied): create `tailwind.config.cjs` and `postcss.config.cjs` with typical starter content. This avoids depending on the CLI.

4. Check npm/node versions: if using very new Node/npm, occasionally `npm exec` behavior changes; pinning npm or using the package-specific npx invocation shown above helps.

What I changed here
-------------------

- Added `my-react-app/tailwind.config.cjs` — minimal content paths for Vite.
- Added `my-react-app/postcss.config.cjs` — enables `tailwindcss` and `autoprefixer` plugins for PostCSS.

Where to look next
------------------

- If you want CLI-generated config files, run the v3 CLI invocation in the mitigation section.
- Otherwise run the dev server: `cd my-react-app && npm run dev` and Vite will pick up PostCSS/Tailwind.
