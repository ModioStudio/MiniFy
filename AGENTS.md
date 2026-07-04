# AGENTS.md

This file is the primary working guide for AI agents and automation in this
repository. It applies to the whole repo unless a more specific `AGENTS.md`
exists in a subdirectory.

## Agent Rule Sources

- Start with this file for project-wide expectations.
- Also inspect `.agents/` when the task touches commits, release notes, coding
  style, or repository structure:
  - `.agents/rules/` contains additional Cursor/agent rule files.
  - `.agents/commands/` contains reusable command workflows, such as commit
    message generation.
- Treat `.agents/` as supplemental context. If it conflicts with this file or
  the current codebase, prefer the current codebase and this file.

## Project Overview

MiniFy is a pnpm monorepo for a Spotify-focused desktop mini player and its web
presence.

- `apps/desktop`: Tauri 2 desktop app with a React/Vite/Tailwind frontend and a
  Rust backend.
- `apps/www`: Next.js marketing/download site.
- `apps/docs`: Astro Starlight documentation site.
- `.changeset`: release notes and version bump entries.
- `.agents`: agent-specific rules and command workflows.

Core desktop responsibilities:

- Spotify OAuth PKCE login and token refresh.
- Secure credential storage through the OS keyring.
- Playback state, controls, layouts, themes, settings, and AI DJ features.
- AI provider integration through the Vercel AI SDK.

## Required Tooling

- Node.js `>=20.19.0`
- pnpm `10.26.2`
- Rust toolchain with Tauri platform prerequisites

Do not add Git hook tooling for quality gates. Quality checks should be explicit
scripts or CI steps, not commit hooks.

## Common Commands

Run commands from the repository root unless noted otherwise.

- `pnpm install`: install workspace dependencies.
- `pnpm dev`: run workspace dev tasks through Turborepo.
- `pnpm desktop:dev`: start the Tauri desktop app in development.
- `pnpm desktop:build`: build the desktop app.
- `pnpm desktop:clear`: clear desktop credentials and settings.
- `pnpm www:dev`: start the Next.js site.
- `pnpm www:build`: build the Next.js site.
- `pnpm docs:dev`: start the docs site.
- `pnpm docs:build`: build the docs site.
- `pnpm lint`: run workspace Biome lint/check tasks.
- `pnpm lint:oxlint`: run Oxlint directly.
- `pnpm quality`: run the explicit quality gate.
- `pnpm test`: alias for the quality gate.
- `pnpm format`: format with Biome.
- `pnpm check`: run Biome check with safe writes.

When verifying a narrow change, prefer the smallest relevant command first, then
run broader gates if the change touches shared behavior, tooling, or CI.

## Code Style

- Follow existing local patterns before introducing new abstractions.
- Use TypeScript types deliberately; avoid `any`.
- Prefer static imports at the top of files.
- Keep React components focused and typed.
- Use Tailwind CSS and existing component conventions.
- Keep comments sparse and useful; explain non-obvious decisions, not obvious
  operations.
- Do not store secrets, tokens, or API keys in source files.
- Keep generated files and Tauri schema output out of manual refactors unless
  the task explicitly requires regeneration.

## Desktop Architecture Notes

Frontend paths:

- Entry: `apps/desktop/src/main.tsx`
- UI root: `apps/desktop/src/ui/index.tsx`
- Views: `apps/desktop/src/ui/views/`
- Layouts: `apps/desktop/src/ui/layouts/`
- Components: `apps/desktop/src/ui/components/`
- Themes: `apps/desktop/src/themes/*.json`
- Global styles: `apps/desktop/src/ui/global.css`

Rust/Tauri paths:

- Config: `apps/desktop/src-tauri/tauri.conf.json`
- Entry: `apps/desktop/src-tauri/src/main.rs`
- Tauri library: `apps/desktop/src-tauri/src/lib.rs`
- Settings: `apps/desktop/src-tauri/src/settings.rs`
- Spotify auth: `apps/desktop/src-tauri/src/spotify_auth.rs`
- YouTube auth: `apps/desktop/src-tauri/src/youtube_auth.rs`

Use Tauri commands for frontend/backend interactions and keep credential access
in the Rust/keyring layer.

## Security And Auth

- Spotify uses OAuth 2.0 PKCE. Do not replace it with cookie scraping or manual
  token entry.
- A Spotify Client ID is public app metadata; a Client Secret must never be
  embedded in this desktop/open-source app.
- Spotify tokens, refresh tokens, AI keys, and provider credentials belong in
  the OS credential store.
- Avoid logging sensitive values, auth callback payloads, or bearer tokens.
- Preserve redirect URI and scope behavior unless the task explicitly changes
  auth requirements.

## Dependency And Release Notes

- Use pnpm for dependency changes so `pnpm-lock.yaml` stays consistent.
- Keep dependency changes scoped to the task.
- Create a changeset in `.changeset/` for user-facing features, fixes,
  performance improvements, CI/workflow changes, or dependency updates with
  user impact.
- Skip changesets for documentation-only, formatting-only, and test-only work.

## Git And Working Tree

- The working tree may contain user changes. Do not revert or overwrite changes
  you did not make.
- Before editing, inspect relevant files and nearby patterns.
- Use conventional commit style when preparing commit messages:
  `<type>(<scope>): <subject>`.
- If asked to commit, inspect staged changes first and commit only what the user
  intended.

## Documentation

- Keep README, docs, CI, and package scripts aligned when tooling changes.
- Use current package names and commands. This repo uses Oxlint as an explicit
  quality gate, not Lefthook.
- Prefer concise docs that help future maintainers run, test, and reason about
  the project.
