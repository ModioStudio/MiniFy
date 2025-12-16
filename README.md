# Minify

![Minify Logo](./assets/logo.png)

**Minify** is an open-source music mini-player by **Modio Studio**, supporting multiple streaming services: Tidal, Spotify, Apple Music, and Amazon Music. Lightweight, beautifully designed, and packed with features for music lovers and power users.

**Website:** [https://modio.studio/minify](https://minify.modio.studio/)  
**Discord Community:** [Join Here](https://discord.gg/qrTuQgd9Vq)

---

## Features

- 🎵 Support for major music services: Tidal, Spotify, Apple Music, Amazon Music  
- 🎨 Multiple themes: Cattpucin, Dracula, Dark, White  
- 🔍 Integrated search for songs, albums, and playlists  
- ⌨️ Hotkeys for quick controls  
- ⚡ Lightweight & high performance  
- ⚙️ Extensive settings & customization options  
- 💾 Offline support for local tracks  
- 📱 Responsive design for desktop (Tauri)  

---

## Requirements

- [Node.js](https://nodejs.org/) >= 18  
- [Rust](https://www.rust-lang.org/) (for Tauri)  
- [Yarn](https://yarnpkg.com/) or npm  

---

## Installation


# Clone the repository
git clone https://github.com/ModioStudio/Minify.git
cd Minify

# Install dependencies
yarn install

# Start the app in development mode
yarn tauri dev

Usage

    Launch the app via the icon or yarn tauri dev

    Use the search bar to find songs, albums, and playlists

    Switch themes and configure hotkeys in Settings

    Control playback with media buttons (Play/Pause, Next, Previous)

Production Build (Executable)

Minify can be built as a standalone executable: .exe for Windows, .app for macOS, or binary for Linux.
Windows

yarn tauri build

    Output: src-tauri/target/release/bundle/msi/Minify Setup.exe

    Install like a regular Windows app

macOS

yarn tauri build

    Output: .app package in the release folder

Linux

yarn tauri build

    Output: Binary or AppImage in the release folder

    Note: All builds are fully offline-ready and include all resources. Users must log in with their own streaming accounts; no music is distributed via Minify.

API / Legal Disclaimer

Minify does not stream or host any music. It only controls official music clients via their APIs. Each user must log in with their own accounts for Tidal, Spotify, Apple Music, or Amazon Music.

    You must comply with the Terms of Service of each streaming provider.

    Minify is a frontend controller only; all content remains the property of the respective streaming services.

    Distribution of copyrighted audio through Minify is not allowed.

Contributing

Contributions are welcome! Please follow these steps:

    Join Discord

    Apply for Contributor

    Fork the repository

    Create a feature branch: git checkout -b feature/MyIdea

    Commit your changes: git commit -m "Feature: My Idea"

    Push your branch: git push origin feature/MyIdea

    Open a Pull Request



License

MIT © Modio Studio

---
