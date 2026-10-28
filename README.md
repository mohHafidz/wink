<div align="center">

<img src="./public/wink-logo.svg" width="96" height="96" alt="Wink Logo" />

# Wink

**The Dynamic Notch Engineered for Windows 11.**

[![Windows 11](https://img.shields.io/badge/Platform-Windows%2011-0078D4?style=flat-square&logo=windows11&logoColor=white)](https://microsoft.com/windows)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square&logo=tauri&logoColor=black)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Backend-Rust-DEA584?style=flat-square&logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)

A lightweight, non-intrusive notch utility that floats seamlessly at the top edge of your screen. Built with native Win32 APIs, Rust, and fluid Apple HIG-inspired spring physics.

[Explore Features](#features) • [Specifications](#specifications--performance) • [Getting Started](#getting-started) • [Build from Source](#building-release)

</div>

---

## Overview

Wink bridges the gap between desktop multitasking and ambient interaction on Windows 11. Instead of cluttering the taskbar with auxiliary widgets, Wink rests as an elegant obsidian capsule at the top bezel of your monitor, automatically adapting to what you are doing.

### Key Capabilities

* **🎵 Universal Media Sync (Windows GSMTC)**: Integrates directly with Windows Global System Media Transport Controls. Displays live track title, artist, elapsed/total time (`mm:ss / mm:ss`), audio waveforms, and controls for Spotify, Apple Music, YouTube, and media players.
* **⚡ Auto-Stealth Edge Mode**: When a foreground window (like Visual Studio Code, Chrome, or full-screen apps) is maximized against the top edge, Wink instantly collapses into a microscopic 6px slit with 0% tab occlusion.
* **📋 Clipboard Stash**: Quick-access history for URLs, code snippets, color hex codes, and clipboard items with one-click re-copying.
* **📁 Temporary Drop Shelf**: Drag-and-drop holding bay for files and assets across displays without cluttering your desktop wallpaper.
* **🎯 Win32 Hit-Test Passthrough**: Custom transparent window hit-testing in Rust ensures mouse clicks outside the capsule pass directly through to background applications.

---

## Specifications & Performance

| Metric | Specification |
| :--- | :--- |
| **Operating System** | Windows 11 (21H2 or newer) |
| **Architecture** | Native x64 / ARM64 Binary |
| **Memory Footprint** | `< 15 MB` RAM in ambient idle |
| **CPU Utilization** | `0.0%` idle (hardware accelerated GPU surface) |
| **Network & Privacy** | `0` external calls (100% offline, zero telemetry) |
| **Display Support** | High-DPI, Multi-Monitor, Per-Monitor DPI Aware |

---

## Project Structure

```text
wink/
├── src/                     # Desktop App Frontend (React + TypeScript + Tailwind)
│   ├── components/          # DynamicIsland, SettingsWindow, WaveCanvas, WinkGlyph
│   ├── types.ts             # Shared application lifecycle types
│   └── settingsStore.ts     # Local settings sync engine
├── src-tauri/               # Desktop App Native Backend (Rust + Win32)
│   ├── src/                 # Media (GSMTC), Volume, Monitor, Clipboard, Shelf
│   ├── icons/               # Multi-DPI app icons (.ico, .icns, .png)
│   ├── Cargo.toml           # Rust dependencies
│   └── tauri.conf.json      # Tauri application configuration
├── public/                  # Static assets & SVG vector logos
├── LICENSE                  # MIT Open Source License
└── README.md
```

---

## Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) (v18 or newer)
* [Rust & Cargo](https://www.rust-lang.org/tools/install) (latest stable)
* [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (required by Tauri on Windows)

### Running in Development Mode

```bash
# Clone the repository
git clone https://github.com/fits-dev/wink.git
cd wink

# Install frontend dependencies
npm install

# Launch in Tauri Development Mode
npm run tauri dev
```

---

## Building Release

To compile the production `.msi` installer and standalone `.exe` binary:

```bash
npm run tauri build
```

The compiled installer and binary will be output to:
`src-tauri/target/release/bundle/msi/`

---

## Author & Credits

Designed and developed by **Muhammad Hafidz** ([fits.dev](https://muhammad-hafidz.netlify.app)).

Contributions, bug reports, and suggestions are welcome! Feel free to open an issue or submit a pull request.

---

## License

This project is licensed under the [MIT License](./LICENSE) — free for both personal and commercial use.
