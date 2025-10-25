# Cursor Rules for Spotify Mini Player

## Project Structure
- This is a Turborepo monorepo with the desktop app in `apps/desktop/`
- Use pnpm as package manager
- Follow the existing file structure and naming conventions

## Code Style
- Write all code in English
- Use TypeScript for all JavaScript/TypeScript files
- Follow existing patterns and conventions in the codebase
- Use Biome for formatting and linting
- Prefer functional components over class components in React

## File Naming
- Use PascalCase for React components (e.g., `Button.tsx`)
- Use camelCase for utility functions and variables
- Use kebab-case for file names when appropriate
- Use descriptive English names that match the project's context

## Git Commits
- Use conventional commit format: `type(scope): description`
- Examples: `feat(desktop): add new player controls`, `fix(auth): resolve token refresh issue`
- Write commit messages in English
- Keep descriptions concise but descriptive

## Development Workflow
- Always run `pnpm check` before committing
- Use `pnpm desktop:dev` to start development
- Use `pnpm desktop:build` to build the app
- Follow the existing API patterns for Tauri commands

## Code Organization
- Keep components small and focused
- Use proper TypeScript types and interfaces
- Follow the existing state management patterns with Zustand
- Maintain separation between UI components and business logic

## Testing
- Write tests for new features
- Ensure existing tests pass
- Use descriptive test names

## Documentation
- Update README when adding new features
- Document any breaking changes
- Keep inline comments minimal but helpful
- Write documentation in English
