<p align="center">
  <img src="src/resources/assets/images/IDI_PIKAICON-1_gap_filled_192.png" width="96" alt="Pikachu Volleyball icon">
</p>

<h1 align="center">Pikachu Volleyball 2.1</h1>

<p align="center">
  <strong>A tiny beach-volleyball classic, carefully brought into a modern Linux desktop.</strong>
</p>

<p align="center">
  Fast to launch. Easy to learn. Suspiciously hard to stop playing.
</p>

<p align="center">
  <a href="https://github.com/santirodriguez/pikachu-volleyball/releases"><img alt="Linux AppImage" src="https://img.shields.io/badge/Linux-AppImage-F7C948?style=for-the-badge&logo=linux&logoColor=111827"></a>
  <img alt="Version 2.1" src="https://img.shields.io/badge/Version-2.1-E63946?style=for-the-badge">
  <img alt="Five languages" src="https://img.shields.io/badge/Languages-5-4EA8DE?style=for-the-badge">
</p>

<p align="center">
  <a href="#download">Download</a> ·
  <a href="#whats-inside">What’s inside</a> ·
  <a href="#controls">Controls</a> ·
  <a href="#credits">Credits</a>
</p>

<p align="center">
  <img src="src/resources/assets/images/screenshot.png" alt="Pikachu Volleyball match" width="760">
</p>

## A small game with a long memory

When I was a kid, simple, joyful games like this one became part of my way into the Pokémon world: colorful, welcoming and endlessly replayable.

This edition is simply my way of looking after a game I remember fondly. The original feel stays at the center, while the interface, controls and Linux desktop experience receive the care they deserve.

> Some childhood games are always worth one more match.

## What’s inside

| | |
|---|---|
| **A proper Linux edition** | Portable AppImage packaging with a focused desktop experience. |
| **One coherent menu** | Pause, restart, match settings, audio, graphics, language and About in one place. |
| **Editable controls** | Remap both players, detect conflicts and restore defaults whenever needed. |
| **Five languages** | English, Español, Català, 한국어 and 中文. |
| **Web foundation preserved** | The browser build remains part of the project rather than becoming an abandoned side quest. |
| **Classic gameplay protected** | Physics, AI, scoring and timing remain faithful to the reverse-engineered implementation. |

## Download

### Linux AppImage

1. Open [GitHub Releases](https://github.com/santirodriguez/pikachu-volleyball/releases).
2. Download the latest `.AppImage` for `x86_64` and `SHA256SUMS.txt`.
3. Verify the checksum, allow the AppImage to run as a program and open it.

See the concise [2.1.0 release notes](docs/releases/v2.1.0.md). Pre-release builds may also appear in the [Build Linux AppImage workflow](https://github.com/santirodriguez/pikachu-volleyball/actions/workflows/release-appimage.yml).

## Controls

These are the defaults. Player controls can be changed from the in-game **Controls** menu.

| Action | Player 1 | Player 2 |
|---|---|---|
| Move left / right | `D` / `G` | `←` / `→` |
| Jump | `R` | `↑` |
| Move down | `V` | `↓` |
| Down-right shortcut | `F` | — |
| Power Hit | `Z` or `Left Shift` | `Enter` or `Left Control` |
| Pause menu | `P` | `P` |
| Practice ball reset | `B` | `B` |

## Languages

<p>
  <strong>English</strong> ·
  <strong>Español</strong> ·
  <strong>Català</strong> ·
  <strong>한국어</strong> ·
  <strong>中文</strong>
</p>

## Credits

**Pikachu Volleyball (1997)** was created by SACHI SOFT / SAWAYAKAN Programmers and Satoshi Takenouchi. Thank you for making the wonderfully simple classic that started everything.

The browser foundation comes from [Kyutae Lee’s JavaScript reverse-engineering reimplementation](https://github.com/gorisanson/pikachu-volleyball). This edition would not exist without that careful work.

The Linux desktop edition, integrated interface, controls, localization and 2.x work are maintained by [Santiago Rodríguez](https://santiagorodriguez.com).

<details>
<summary><strong>Development and packaging</strong></summary>

### Requirements

- Node.js `22.12.0`
- npm

### Common commands

```bash
npm ci
npm run start
npm run quality:check
npm run build:desktop:linux
```

- `npm run start` launches the development web server.
- `npm run quality:check` runs lint, unit tests and the production web build.
- `npm run build:desktop:linux` creates the Linux AppImage under `release/`.

### Extension guides

- [Game presentation and graphical extension guide](docs/game-presentation-extension-guide.md)
- [Control binding extension guide](docs/control-binding-extension-guide.md)

The project keeps simulation, input, presentation and desktop integration separated so future visual work does not accidentally rewrite the game itself.

</details>

---

<p align="center">
  Unofficial fan project. Not affiliated with or endorsed by the Pokémon rights holders.
</p>
