# Contributing to JSON as Table

Thanks for your interest in contributing! This document outlines how to get started.

## Getting Started

1. **Fork** the repository and clone your fork locally.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:5173](http://localhost:5173) in your browser.

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```
2. Make your changes — keep commits small and focused.
3. Run the linter and tests before pushing:
   ```bash
   npm run lint
   npm test
   ```
4. Push your branch and open a Pull Request against `main`.

## Code Style

- **TypeScript** — all source files use `.ts` / `.tsx`. Avoid `any`; prefer explicit types.
- **React** — functional components with hooks only. No class components.
- **Tailwind CSS** — use semantic design tokens (`bg-background`, `text-foreground`, `border-border`, etc.) instead of raw color classes. All custom colors live in `src/index.css` and `tailwind.config.ts`.
- **shadcn/ui** — use existing UI primitives from `src/components/ui/` before creating custom elements.
- **Imports** — use the `@/` path alias (e.g. `import { cn } from "@/lib/utils"`).
- **Naming** — PascalCase for components, camelCase for functions/variables, kebab-case for file names.

## Project Structure

```
src/
├── components/       # Application components
│   └── ui/           # shadcn/ui primitives (don't edit directly)
├── hooks/            # Custom React hooks
├── lib/              # Utility functions
├── pages/            # Route-level page components
├── test/             # Test setup and test files
└── index.css         # Global styles & design tokens
```

## Pull Request Guidelines

- Keep PRs focused on a single change.
- Provide a clear description of **what** changed and **why**.
- Include screenshots for UI changes.
- Ensure no lint errors or test failures.

## Reporting Issues

- Use GitHub Issues with a clear title and reproduction steps.
- Include browser/OS info for UI bugs.
- Label issues appropriately (`bug`, `enhancement`, `question`).

## License

By contributing you agree that your contributions will be licensed under the [MIT License](LICENSE).
