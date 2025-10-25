# Development Guidelines

## Architecture
- Turborepo monorepo structure
- Desktop app in `apps/desktop/`
- Tauri for desktop app framework
- React + TypeScript for frontend
- Rust for Tauri backend

## Dependencies
- Use pnpm for package management
- Prefer established libraries over custom implementations
- Keep dependencies up to date
- Use exact versions for critical dependencies

## Code Quality
- Always use TypeScript strict mode
- Prefer explicit types over `any`
- Use proper error handling
- Follow React best practices
- Use proper state management patterns

## Performance
- Optimize bundle size
- Use proper React optimization techniques
- Minimize re-renders
- Use proper caching strategies

## Security
- Validate all inputs
- Use proper authentication patterns
- Follow OAuth best practices
- Keep sensitive data secure
