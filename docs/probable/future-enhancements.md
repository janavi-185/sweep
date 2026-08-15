# Future Enhancements & CLI Customizations

> **Goal:** A dedicated roadmap for user experience enhancements, personalization, and visual customization to make Sweep feel tailored and delightful for developers.

---

## Overview

This document tracks upcoming experiential features and quality-of-life enhancements that can be layered onto the core Sweep engine as future phases or modular additions.

---

## 1. First-Run User Onboarding (User Identity Setup)

### Problem
When developers run Sweep for the first time, there is no personal context or saved user preferences.

### Proposed Solution
An interactive, one-time first-run onboarding prompt that takes the user's name/handle before executing their first command.

### Flow & Architecture
1. **First-Run Detection**:
   - Check if `~/.sweep/config.json` exists.
   - If not found, trigger the interactive onboarding flow.
2. **Interactive Prompt**:
   - Greet the user with a stylized ASCII banner:
     ```text
       ┌──────────────────────────────────────────────┐
       │   Welcome to Sweep — macOS Storage Cleaner   │
       └──────────────────────────────────────────────┘
       Let's set up your environment (takes 5 seconds):
       ? What should we call you? [Developer / username]: 
     ```
3. **Local Persistence**:
   - Save the user profile to `~/.sweep/config.json`:
     ```json
     {
       "user": {
         "name": "Janavi",
         "firstRunAt": "2026-08-15T17:18:00Z"
       },
       "theme": "default"
     }
     ```
4. **Usage in CLI**:
   - Personalized header in scan and cleanup summaries:
     `Sweep Scan — Welcome back, Janavi!`
   - Log author attribution in scan history.
5. **Config Commands**:
   - `sweep config get user.name`
   - `sweep config set user.name <newName>`

---

## 2. CLI Color Themes & Visual Customization

### Problem
Developers use different terminal backgrounds (dark, light, Nord, Solarized, Dracula) and have personal aesthetic preferences. Hardcoded cyan/blue colors may clash with some terminal setups.

### Proposed Solution
A pluggable CLI theme system with curated color palettes that adjust bar charts, borders, banners, and status badges.

### Available Themes
| Theme Name | Primary Accent | Secondary / Bars | Borders | Best For |
|---|---|---|---|---|
| `default` | Cyan | Cyan (`█`) + Gray (`░`) | Cyan | Dark terminals |
| `nord` | Frost Blue (`#88C0D0`) | Teal (`#8FBCBB`) | Slate Blue | Nord theme users |
| `dracula` | Purple / Pink (`#BD93F9`) | Green (`#50FA7B`) | Magenta | Dracula theme users |
| `emerald` | Forest Green (`#10B981`) | Mint (`#34D399`) | Dark Green | Clean, nature aesthetic |
| `amber` | Golden Amber (`#F59E0B`) | Warm Yellow (`#FBBF24`) | Orange | Retro terminal feel |
| `monochrome` | Bold White | White (`█`) + Gray (`░`) | White / Dim | Minimalist / CI runners |

### Theme Architecture
- **Theme Token Definition (`packages/core/src/theme/`)**:
  ```typescript
  export interface CliTheme {
    name: string;
    primary: (text: string) => string;
    secondary: (text: string) => string;
    success: (text: string) => string;
    warning: (text: string) => string;
    error: (text: string) => string;
    barFilled: string;
    barEmpty: string;
  }
  ```
- **CLI Commands**:
  - `sweep theme list` — Preview all available color palettes in terminal.
  - `sweep config set theme <theme_name>` — Save preference to `config.json`.
  - `sweep theme preview dracula` — Test how a theme looks without saving.

---

## 3. Directory Navigation, Tab Completion & Path Suggestions

### Problem
Users who don't remember exact macOS paths or folder structures may get stuck typing full directory strings manually.

### Proposed Solution
A dual approach providing **shell tab autocompletion** and **interactive directory suggestions**:

1. **Interactive Path Picker (`sweep scan --interactive` or `sweep scan` with no path)**:
   - Present a selectable list of common target folders using arrow keys:
     ```text
     ? Select target directory to scan:
     ❯ 📁 Downloads (~/Downloads)
       📁 Documents (~/Documents)
       📁 Xcode Caches & DerivedData (~/Library/Developer/Xcode)
       📁 macOS App Caches (~/Library/Caches)
       📁 User Home Directory (~)
       📁 Custom path entry...
     ```
2. **Shell Tab Completion (`sweep completion`)**:
   - Provide a command to install native tab completion scripts for `zsh`, `bash`, and `fish`:
     `sweep completion zsh >> ~/.zshrc`
   - When typing `sweep scan ~/D<Tab>`, the shell automatically completes to `~/Downloads`, `~/Documents`, `~/Desktop`, etc.

---

## 4. Cross-Platform Support: Windows (and Linux)

### Problem
Sweep is currently tailored to macOS paths (e.g. `~/Library/Caches`, Xcode DerivedData, Homebrew). Windows developers also suffer from massive disk bloat (Visual Studio caches, NuGet packages, WSL2 virtual disks, and Windows temporary build files).

### Proposed Solution
An OS-agnostic path resolver and modular rule registry per operating system:

1. **OS-Aware Path Resolver (`packages/core/src/platform/`)**:
   - macOS: `~/Library/Caches`, `~/Library/Application Support`
   - Windows: `%LOCALAPPDATA%`, `%APPDATA%`, `%USERPROFILE%`, `%TEMP%`
   - Linux: `~/.cache`, `~/.config`, `/var/log`

2. **Windows Developer Tools Registry (`packages/rules/src/developer/windows/`)**:
   - **Visual Studio**: `%LOCALAPPDATA%\Microsoft\VisualStudio\Packages`, MSBuild caches
   - **NuGet**: `%USERPROFILE%\.nuget\packages`
   - **Scoop / Chocolatey**: `%USERPROFILE%\scoop\cache`, `C:\ProgramData\chocolatey\cache`
   - **WSL2 VHDX Virtual Disks**: Real vs sparse sizing of `ext4.vhdx` images
   - **Node / Python / Flutter (Windows)**:
     - npm: `%LOCALAPPDATA%\npm-cache`
     - pnpm: `%LOCALAPPDATA%\pnpm\store`
     - Yarn: `%LOCALAPPDATA%\Yarn\Cache`
     - pip: `%LOCALAPPDATA%\pip\Cache`
     - Flutter: `%LOCALAPPDATA%\Pub\Cache`
     - Rust: `%USERPROFILE%\.cargo\registry`
     - Java: `%USERPROFILE%\.m2`

3. **Windows System & User Junk**:
   - User & System Temp (`%TEMP%`, `C:\Windows\Temp`)
   - Windows Update download cache (`C:\Windows\SoftwareDistribution\Download`)
   - Recycle Bin (`$Recycle.Bin`)
   - Thumbnails & icon cache (`%LOCALAPPDATA%\IconCache.db`)

---

## 5. Future Ideas Backlog

*New items will be added here as we iterate.*

- [ ] First-time interactive username prompt on empty config
- [ ] Theme configuration engine (`default`, `nord`, `dracula`, `emerald`, `amber`, `monochrome`)
- [ ] Interactive directory picker (`sweep scan --interactive`) with arrow keys
- [ ] Shell tab-completion generator (`sweep completion zsh|bash|fish`)
- [ ] Windows cross-platform developer tool paths & system junk rules
- [ ] Customizable scan exclude patterns via config (`sweep config add exclude "**/build/**"`)
- [ ] Terminal sound / notification chime on completion of large scans (> 100k files)
- [ ] Export scan results to interactive HTML report (`sweep scan ~/Downloads --html report.html`)
