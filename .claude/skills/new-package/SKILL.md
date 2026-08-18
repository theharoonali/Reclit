---
name: new-package
description: Scaffold a new shared workspace package under packages/. Use when the user asks to create a new package, shared library, or module in the monorepo.
---

# Scaffold a new workspace package

Create `packages/<name>/` with these files. The `packages/*` workspace glob picks it up
automatically — no registration anywhere else. Run `bun install` afterwards so the
workspace link is created.

## package.json

```json
{
  "name": "@repo/<name>",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "typecheck": "tsc --noEmit"
  },
  "exports": {
    ".": "./src/index.ts"
  },
  "devDependencies": {
    "typescript": "catalog:"
  }
}
```

Rules:
- Shared third-party deps use `"dep": "catalog:"` — if the dep isn't in the root
  `package.json` catalog yet, add it there with a pinned version.
- Depend on sibling packages with `"@repo/x": "workspace:*"`.
- Add granular `exports` entries (`"./thing": "./src/thing.ts"`) rather than barrel-exporting
  everything through index.

## tsconfig.json

```json
{
  "extends": "@repo/tsconfig/base.json",
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

For React component packages, extend `@repo/tsconfig/react-library.json` instead.

## src/index.ts

Start with the real implementation — no placeholder re-exports.

## Verify

```bash
bun install
bunx turbo typecheck --filter=@repo/<name>
```
