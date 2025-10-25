# Custom Commands

## Git Workspace Management
When you type "custom" in chat, return these commands:

```bash
git fetch --all --prune; git reset --hard origin/main; git clean -fd; git status -sb
```

Note: Check current branch first and replace "main" with the actual branch name.

## Development Setup
```bash
# Install dependencies
pnpm install

# Install Lefthook hooks
npx lefthook install

# Start development
pnpm desktop:dev
```

## Build Commands
```bash
# Build desktop app
pnpm desktop:build

# Build all apps
pnpm build
```

## Code Quality
```bash
# Format and lint
pnpm check

# Format only
pnpm format

# Lint only
pnpm lint
```
