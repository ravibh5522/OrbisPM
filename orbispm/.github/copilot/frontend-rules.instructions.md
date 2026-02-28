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

import type { Task } from '@/types/task'
```

## Styling
- Tailwind CSS only — NO inline styles, NO CSS modules, NO styled-components
- Use `cn()` for conditional classes: `cn('base-class', isActive && 'active-class')`
- Use Shadcn/UI design tokens (colors, spacing, typography)
- Responsive: mobile-first with `sm:`, `md:`, `lg:` breakpoints

## State Management
| Need | Solution |
|------|---------|
| Server data | React Query (TanStack Query) |
| Form state | React Hook Form |
| Client UI state | Zustand (minimal stores) |
| URL state | Next.js `searchParams` |
| Auth state | Context from GoTrue client |

## Performance
- Server Components by default — `'use client'` only when needed
- Use `<Suspense>` with `loading.tsx` for data-dependent sections
- Use React Query's `staleTime` to avoid refetching (5 min for lists, 1 min for detail)
- Use `React.memo()` for expensive list item renders (task tree rows)
- Lazy load heavy components: `dynamic(() => import('./heavy-component'), { ssr: false })`

## Accessibility
- All interactive elements: proper `aria-label` or visible label
- Keyboard navigation: `onKeyDown` handlers for custom interactive components
- Color contrast: meet WCAG AA (Shadcn/UI handles this by default)
- Focus management: trap focus in modals, restore on close

## Error Handling
- API errors: catch in React Query `onError`, show toast notification
- Render errors: `error.tsx` per route segment
- Network offline: show persistent banner via `navigator.onLine`
- Validation errors: inline per-field via React Hook Form + Zod
