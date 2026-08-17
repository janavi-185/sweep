# Sweep 🧹

Sweep is a developer-focused macOS storage analyzer and safe cleanup CLI tool built with TypeScript.

* **macOS Storage Analyzer & Cleanup Tool**: Helps you scan your Mac to inspect disk usage, break down storage by category, and identify large files.
* **Identifies Hidden Developer Bloat**: Automatically detects heavy tool caches and build artifacts (Xcode DerivedData, Docker containers, npm, pnpm, Yarn, Gradle, Cargo, and pip caches) that silently consume gigabytes of space.
* **Permission-First Safety Model**: Never deletes files automatically — explains what every item is, why it is safe to remove, and requires explicit user confirmation before any deletion.
* **Byte-for-Byte Duplicate Finder**: Uses a two-pass size-filtering and SHA-256 content hashing engine to pinpoint exact duplicate files wasting disk space.
* **Persistence & Fast Incremental Scanning**: Saves scan history, maintains a cleanup audit log in a local SQLite database (`~/.sweep/sweep.db`), and caches scan results for fast repeated runs.
