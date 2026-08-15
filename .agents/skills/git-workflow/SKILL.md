---
name: git-workflow
description: Strict Git commit, verification, and formatting workflow rules for the Sweep project. Always follow when asked to commit, push, or merge code.
---

# Git Workflow & Commit Rules

This skill defines the mandatory Git rules and verification workflow for the Sweep project.

## Core Rules

1. **Permission Required for Commits & Pushes**:
   - **NEVER** create a git commit or push to remote branches until the user explicitly requests it.
   - Stage changes, test changes, and report status, but wait for explicit instruction before invoking `git commit` or `git push`.

2. **Pre-Commit Verification**:
   - **ALWAYS** run and verify the complete check suite before executing any commit:
     ```bash
     pnpm run build && pnpm run typecheck && pnpm run lint && pnpm run test
     ```
   - Ensure all checks pass with **exit code 0** (0 type errors, 0 lint errors, 0 test failures) before proceeding with the commit.

3. **Short Commit Message & Prefix Formatting**:
   - **ALWAYS** keep commit messages very short and concise.
   - **Prefix Format (`feat: ...`, `fix: ...`, `refactor: ...`)**:
     - Use prefixes ONLY when committing an entire phase update, major feature completion, or large architectural refactor (e.g. `feat: implement storage analyzer engine and reporting`).
   - **Normal Commit Format**:
     - For routine updates, small fixes, documentation tweaks, or incremental changes, use a normal short sentence without prefixes (e.g. `resolve scanner imports and type definitions`, `add future docs folder`).
   - **NEVER** include phase numbers (e.g. `phase-1`, `phase 2`, `Phase 3`) in commit messages.

4. **Branch & Push Flow**:
   - Push feature branches to `origin/<branch-name>` when instructed.
   - Merge into `main` using fast-forward when requested.
   - Re-verify build suite on `main` before pushing `main` to `origin/main`.
