<a id="readme-top"></a>

<div align="center">
  <img src=".docs/assets/logo.png?raw=1" alt="MiniFy logo" width="140" height="140">
  <h1>MiniFy</h1>
  <p>Spotify mini player for desktop built with Tauri + React, paired with a Next.js landing site.</p>
  <p>
    <a href="https://github.com/ModioStudio/MiniFy/issues/new?labels=bug">Report Bug</a>
    ·
    <a href="https://github.com/ModioStudio/MiniFy/issues/new?labels=enhancement">Request Feature</a>
    ·
    <a href="https://github.com/orgs/ModioStudio/projects/2">Project Board</a>
  </p>
  <div>
    <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.8" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
    <img src="https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black" alt="Tauri 2" />
    <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" alt="Vite 7" />
    <img src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white" alt="Next.js 15" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
    <img src="https://img.shields.io/badge/Spotify%20API-Now%20Playing-1DB954?logo=spotify&logoColor=white" alt="Spotify API" />
    <img src="https://img.shields.io/badge/Turborepo-2-000000?logo=turbo&logoColor=white" alt="Turborepo 2" />
    <img src="https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm&logoColor=white" alt="pnpm 9" />
    <img src="https://img.shields.io/badge/Rust-Tauri%20core-000000?logo=rust&logoColor=white" alt="Rust" />
  </div>
</div>

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Roadmap](#roadmap)
- [Architecture](#architecture)
- [Screenshots](#screenshots)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
  - [Running Locally](#running-locally)
- [Scripts](#scripts)
- [Tech Stack](#tech-stack)
- [License](#license)

## Overview
MiniFy is a lightweight Spotify mini player built with Tauri. It lives as a frameless desktop overlay, polls the Spotify API for the currently playing track, and gives you playback controls, themeable layouts, and native OS menus. A Next.js site lives alongside the desktop app for marketing and downloads.

## Features
- Spotify OAuth flow with secure token storage and automatic refresh.
- Three player layouts (A, B, C) with a layout switcher and theme presets.
- Playback controls, scrubbing, and save-to-library actions powered by the Spotify API.
- Native context menu with quick access to settings, debug tools, and window controls.
- Keyboard-friendly design with configurable shortcuts and a drag-safe window region.

## Roadmap
- Follow progress and planned milestones on the project board: [ModioStudio MiniFy Roadmap](https://github.com/orgs/ModioStudio/projects/2)

## Architecture
- Tauri shell hosting a Vite + React UI for the player.
- Rust commands manage OAuth, token storage, and Spotify Web API calls.
- Shared settings persisted on disk; playback state is polled and cached in the renderer.
- Optional Next.js 15 site for the public landing page.

<div align="center">
  <img src=".docs/assets/plan.png" alt="MiniFy architecture" width="900">
</div>

## Screenshots
<details>
  <summary>Show screenshots</summary>
  <div align="center">
    <img src=".docs/assets/layouta.png" alt="MiniFy Layout A" width="900">
  </div>
  <div align="center">
    <img src=".docs/assets/Layoutb.png" alt="MiniFy Layout B" width="900">
  </div>
</details>

## Project Structure
- `apps/desktop`: Tauri 2 desktop app using React 19, Vite 7, and Tailwind 4.
- `apps/www`: Next.js 15 site for marketing and downloads.
- `packages` (empty today): reserved for future shared libraries.
- Root tooling: Turborepo orchestrates tasks, Biome handles lint/format, pnpm powers the workspace.

## Getting Started

### Prerequisites
- Node.js >= 18 and pnpm 9.
- Rust toolchain with the platform-specific Tauri prerequisites.
- Spotify Developer application to obtain a Client ID.

### Setup
1. Install dependencies: `pnpm install`
2. (Optional) Install Git hooks: `pnpm dlx lefthook install`
3. Have your Spotify Client ID ready; the desktop app will ask for it on first launch.

### Running Locally
- Desktop app: `pnpm desktop:dev`
  - First boot asks for the Spotify Client ID, performs OAuth, and lets you pick layout/theme.
- Web site: `pnpm www:dev`
  - Starts the Next.js site (default port 3000).

## Scripts
- `pnpm dev` — run workspace dev tasks via Turborepo.
- `pnpm desktop:dev` — launch the Tauri app in dev mode.
- `pnpm desktop:build` — create a production desktop bundle.
- `pnpm desktop:clear` — clear app data and cached tokens.
- `pnpm www:dev` — start the Next.js site.
- `pnpm www:build` — build the Next.js site.
- `pnpm lint` — run Biome checks across the workspace.

## Tech Stack
- Desktop: Tauri 2, React 19, Vite 7, Tailwind CSS 4, Spotify Web API.
- Backend bridge: Rust + Tauri commands for OAuth, token storage, and playback actions.
- Web: Next.js 15 with React 19.
- Tooling: Turborepo, pnpm, Biome, Lefthook.

## License
Licensed under the MIT License. See `LICENSE` for details.