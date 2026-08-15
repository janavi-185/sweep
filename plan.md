# StackSweep 🧹

> **Understand your Mac. Find what's wasting your storage. Clean it safely.**

StackSweep is a developer-focused macOS storage analyzer and cleanup CLI built with TypeScript.

Instead of blindly deleting files, StackSweep aims to **scan, analyze, explain, and safely clean** unnecessary data from your Mac.

---

## 🚧 Project Status

**Early Development**

The project is currently focused on building the CLI and core filesystem engine.

Planned features will be added incrementally.

---

## 🎯 Why StackSweep?

macOS can show a large amount of storage under **System Data**, but it isn't always obvious what is actually consuming that space.

For developers, storage can grow quickly because of:

* Xcode DerivedData
* Docker data
* npm / pnpm caches
* Gradle caches
* Android SDKs
* Homebrew caches
* Application caches
* Logs
* Temporary files
* Duplicate files
* Old development artifacts

StackSweep aims to make this information understandable and actionable.

Instead of:

```text
System Data: 80 GB
```

StackSweep should eventually help you understand:

```text
System Data: 80 GB

Developer caches       24.2 GB
Application caches     18.4 GB
Docker data            12.7 GB
Logs                    3.1 GB
Temporary files         2.8 GB
Other                  18.8 GB
```

---

## ✨ Planned Features

### 🔍 Storage Scanner

Scan directories and understand where storage is being used.

```bash
stacksweep scan ~/Downloads
```

Planned output:

```text
StackSweep Scan

Files:       1,284
Directories: 87
Total Size:  18.42 GB

Largest Categories

Videos        8.2 GB
Archives      4.1 GB
Documents     2.7 GB
Images        1.8 GB
Other         1.6 GB
```

### 📊 Storage Analyzer

Analyze scanned data and identify:

* Largest files
* Largest directories
* File categories
* Cache directories
* Temporary files
* Developer-related storage
* Potential cleanup candidates

### 🧹 Safe Cleanup

StackSweep will not blindly delete arbitrary system files.

The cleanup engine will use explicit safety rules to determine what can be removed.

```text
Item: Xcode DerivedData
Size: 12.4 GB

Safe to remove: Yes

Reason:
Xcode can regenerate these build artifacts.

[ Clean ]
```

### ♻️ Duplicate Detection

Find duplicate files using efficient comparison and hashing.

The implementation will avoid unnecessarily hashing every file by first comparing inexpensive metadata such as file size.

### ⚡ Caching

Repeated filesystem scans can be expensive.

StackSweep will eventually use caching to avoid unnecessary work.

```text
First scan
    ↓
Filesystem
    ↓
Analyze
    ↓
Cache result

Next scan
    ↓
Check cache
    ↓
Use valid results
```

Planned concepts:

* Cache-aside
* Cache hits / misses
* TTL
* Cache invalidation
* Incremental scanning

### 👨‍💻 Developer Cleanup

A dedicated developer-storage analyzer will eventually identify storage used by tools such as:

* Xcode
* Docker
* npm
* pnpm
* Gradle
* Android SDK
* Homebrew
* Python environments

Example:

```text
Developer Storage

Xcode          21.4 GB
Docker         18.2 GB
Android SDK    11.7 GB
Gradle          6.1 GB
npm             3.2 GB

Potential cleanup: 34.8 GB
```

### 🗄️ Scan & Cleanup History

SQLite will eventually store:

* Scan history
* Cleanup history
* User settings
* Cleanup rules

### 🖥️ Desktop Application

A graphical desktop application is planned after the CLI and core engine are stable.

The CLI and desktop application will share the same core engine.

```text
                 StackSweep
                     │
             ┌───────┴───────┐
             ↓               ↓
            CLI            Desktop
             │               │
             └───────┬───────┘
                     ↓
                  Core
```

---

## 🏗️ Architecture

StackSweep is designed as a monorepo so that multiple applications can share the same core functionality.

```text
stacksweep/
│
├── apps/
│   ├── cli/
│   └── desktop/          # Planned
│
├── packages/
│   ├── core/
│   ├── database/
│   ├── types/
│   └── config/
│
├── scripts/
├── tests/
├── docs/
├── .github/
│   └── workflows/
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

### Core Architecture

```text
CLI / Desktop
      │
      ↓
  Core Engine
      │
 ┌────┼───────────────┐
 ↓    ↓       ↓       ↓
Scan Analyze Cache  Cleaner
 ↓      ↓      ↓       ↓
Filesystem ───────── Safety
```

The interfaces should remain thin while the core package contains the actual StackSweep functionality.

---

## 🛠️ Tech Stack

### Core

* TypeScript
* Node.js
* pnpm

### CLI

* Commander.js

### Database

* SQLite

### Desktop

* React
* TypeScript

### Testing

* Vitest

### Development

* Git
* GitHub Actions
* Docker for optional development experiments

### Future Distribution

Potential installation methods:

```bash
npm install -g @stacksweep/cli
```

or:

```bash
curl -fsSL https://.../install.sh | sh
```

Homebrew distribution may also be supported later.

---

## 📚 Learning Goals

StackSweep is also a learning project designed around real software engineering concepts.

The project will explore:

* CLI architecture
* Filesystem operations
* File hashing
* Duplicate detection
* Caching
* Cache invalidation
* Incremental processing
* Concurrency
* SQLite
* Package architecture
* Monorepos
* CI/CD
* Release automation
* Shell scripting
* macOS system concepts
* Desktop application architecture

Advanced technologies such as Redis, Kafka, and Docker may be explored separately when they provide a meaningful learning opportunity.

They are **not required dependencies of StackSweep**.

---

## 🔐 Safety Philosophy

StackSweep is designed around a simple principle:

> **Never delete something just because it is large.**

The cleanup engine should:

1. Identify the item.
2. Determine what it belongs to.
3. Explain why it can be removed.
4. Apply safety rules.
5. Ask for confirmation when necessary.
6. Avoid unknown or potentially critical system files.

AI, if introduced in the future, will not be responsible for making final deletion decisions.

---

## 🚀 Development Roadmap

### Phase 1 — CLI Foundation

* [ ] Monorepo setup
* [ ] TypeScript configuration
* [ ] CLI setup
* [ ] `--help`
* [ ] `--version`
* [ ] `scan` command

### Phase 2 — Filesystem Scanner

* [ ] Directory traversal
* [ ] File metadata
* [ ] File sizes
* [ ] File categorization
* [ ] Terminal reports

### Phase 3 — Analyzer

* [ ] Largest files
* [ ] Largest directories
* [ ] Storage categories
* [ ] Cleanup candidates

### Phase 4 — Cleaner

* [ ] Safety rules
* [ ] Confirmation
* [ ] Cleanup operations
* [ ] Cleanup reports

### Phase 5 — Advanced Analysis

* [ ] Duplicate detection
* [ ] Hashing
* [ ] Developer storage
* [ ] Incremental scanning

### Phase 6 — Performance

* [ ] Caching
* [ ] Cache invalidation
* [ ] Concurrency
* [ ] Performance benchmarking

### Phase 7 — Persistence

* [ ] SQLite
* [ ] Scan history
* [ ] Cleanup history
* [ ] User configuration

### Phase 8 — Distribution

* [ ] GitHub Actions
* [ ] Automated releases
* [ ] npm package
* [ ] curl installer
* [ ] Homebrew support


### Phase 10 — Future Exploration

AI and other advanced technologies will only be introduced if they solve a real problem in the finished product.

---

## 💻 Development

Clone the repository:

```bash
git clone <repository-url>
cd stacksweep
```

Install dependencies:

```bash
pnpm install
```

Run the CLI in development:

```bash
pnpm dev
```

Build the project:

```bash
pnpm build
```

Run tests:

```bash
pnpm test
```

---

## 📌 Project Philosophy

StackSweep is being built with one principle:

> **Build the simple version first. Add complexity only when there is a reason for it.**

The project will start as a CLI and gradually evolve into a complete macOS storage utility.

---

## 📄 License

License: TBD.
