---
applyTo: "frontend/**/*.{ts,tsx,css}"
---

# Frontend Rules

## Component Structure
```
ComponentName/
├── component-name.tsx      # Component implementation
├── component-name.test.tsx # Tests (if complex)
└── index.ts               # Re-export
```

Or for simple components, just a single file in the parent folder.

## Import Order
React/Next.js → third-party → components → lib/hooks → types, separated by blank lines:
```tsx
import { Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { TaskTreeRow } from '@/components/task/task-tree-row'

import { usePermissions } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'

import type { Task } from '@/types/domain'
```

## Styling
- Tailwind CSS 4 only — NO inline styles, NO CSS modules, NO styled-components
- Use `cn()` (clsx) for conditional classes: `cn('base-class', isActive && 'active-class')`
- Use DaisyUI 5 component classes: `btn`, `card`, `modal`, `badge`, `tooltip`, etc.
- Theme: DaisyUI themes (light/dark) — configured in `tailwind.config`
- Responsive: mobile-first with `sm:`, `md:`, `lg:` breakpoints

## State Management
| Need | Solution |
|------|---------|
| Server data | TanStack Query v5 (`@tanstack/react-query`) |
| Form state | React Hook Form + Zod validation |
| Auth state | Zustand store (`stores/auth-store.ts`) — user, orgs, currentOrg, tokens |
| Task state (project) | Zustand store (`stores/project-task-store.ts`) — WebSocket-driven maps |
| Real-time (org) | `useOrgSocket` hook — single org-level WebSocket, request-response + broadcasts |
| Real-time (project) | `useProjectSocket` hook — wraps org socket with project room join/leave |
| Permissions | `usePermissions` hook — reads from org socket's effective permissions |
| URL state | Next.js `searchParams` |

## Performance
- Server Components by default — `'use client'` only when needed
- Use `<Suspense>` with `loading.tsx` for data-dependent sections
- Use React Query's `staleTime` to avoid refetching (5 min for lists, 1 min for detail)
- Use `React.memo()` for expensive list item renders (task tree rows)
- Lazy load heavy components: `dynamic(() => import('./heavy-component'), { ssr: false })`

## Accessibility
- All interactive elements: proper `aria-label` or visible label
- Keyboard navigation: `onKeyDown` handlers for custom interactive components
- Color contrast: meet WCAG AA (DaisyUI themes handle this by default)
- Focus management: trap focus in modals, restore on close

## Error Handling
- API errors: catch in React Query `onError`, show toast notification
- Render errors: `error.tsx` per route segment
- Network offline: show persistent banner via `navigator.onLine`
- Validation errors: inline per-field via React Hook Form + Zod
