# Changesets

This folder contains changeset files that track changes for the next release.

## How to add a changeset

Run the following command to create a new changeset:

```bash
pnpm changeset
```

This will prompt you to:
1. Select which packages have changed
2. Choose the type of change (major, minor, patch)
3. Write a summary of the changes

## Changeset types

- **major**: Breaking changes
- **minor**: New features (backwards compatible)
- **patch**: Bug fixes (backwards compatible)

## Example

A changeset file looks like this:

```md
---
"MiniFy": minor
---

Added dark mode support to the desktop application
```

## Release process

When the release workflow runs, it will:
1. Read all changeset files
2. Generate a changelog from them
3. Include all commits since the last release
4. Create a new GitHub release with all build artifacts

