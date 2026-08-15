# Sweep 🧹

> **Understand your Mac. Find what's wasting your storage. Clean it safely.**

Sweep is a developer-focused macOS storage analyzer and cleanup CLI & desktop app built with TypeScript.

Instead of blindly deleting files, Sweep aims to **scan, analyze, explain, and safely clean** unnecessary data from your Mac.

---

## 🏗️ Monorepo Structure

Sweep is structured as a lean TypeScript monorepo managed with `pnpm` workspaces:

```
sweep/
│
├── apps/
│   ├── cli/                    # CLI binary (@sweep/cli)
│   └── desktop/                # Native Desktop GUI (@sweep/desktop)
│
├── packages/
│   ├── core/                   # Core engine, types & safety rules (@sweep/core)
│   └── database/               # SQLite persistence layer (@sweep/database)
│
├── scripts/                    # Installer & release helper scripts
├── tests/                      # Integration & baseline test suite
└── docs/                       # Project architecture & phase documentation
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18+ or v20+
- **pnpm**: v8+

### Setup

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd sweep
pnpm install
```

### Development Commands

- **Build packages**: `pnpm build`
- **Typecheck**: `pnpm typecheck`
- **Lint**: `pnpm lint`
- **Format**: `pnpm format`
- **Test**: `pnpm test`

---

## 🔐 Safety Philosophy

> **Never delete something just because it is large.**

Sweep requires explicit confirmation before performing any cleanup actions. Every candidate is explained with clear reasoning and safety checks.

---

## 📄 License

MIT
