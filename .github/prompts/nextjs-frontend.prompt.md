---
applyTo: "frontend/**/*.{ts,tsx}"
---

# Next.js Frontend Development — OrbisPM

You are working on the OrbisPM Next.js 15 frontend (App Router, SSR, TypeScript).

## Tech Stack
- **Framework:** Next.js 15 with App Router
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **Components:** Shadcn/UI (from `components/ui/`)
- **State:** React Query (TanStack Query) for server data, Zustand for client UI state
- **Forms:** React Hook Form + Zod validation
- **Editor:** Tiptap (rich text)
- **Charts:** Recharts
- **Drag & Drop:** @dnd-kit
- **Real-time:** Custom WebSocket client (`lib/ws.ts`)

## Architecture Rules

### Server Components (Default)
- ALL components are Server Components by default
- Use `'use client'` ONLY when the component needs: `useState`, `useEffect`, event handlers, browser APIs
- Fetch data in Server Components using `async/await` — NOT `useEffect`
- Use `<Suspense>` with `loading.tsx` for streaming

### Client Components
- Keep Client Components small and focused
- Lift data fetching out of Client Components into parent Server Components
- Use React Query for client-side data that needs real-time updates

### Route Structure
- All authenticated routes under `(app)/[orgSlug]/`
- Auth routes under `(auth)/`
- Each route folder has: `page.tsx`, `loading.tsx`, `error.tsx`

## Code Patterns

### Server Component (data fetching)
```tsx
// app/(app)/[orgSlug]/projects/[projectId]/tasks/page.tsx
import { getTaskTree } from '@/lib/api'

export default async function TasksPage({ params }: { params: { orgSlug: string; projectId: string } }) {
  const tasks = await getTaskTree(params.projectId)
  return <TaskTreeView initialData={tasks} />
}
```

### Client Component (interactivity)
```tsx
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'

export function TaskTreeView({ initialData }: { initialData: Task[] }) {
  const { data: tasks } = useQuery({
    queryKey: ['tasks', projectId],
    initialData,
  })
  // ...interactive tree with drag-and-drop
}
```

### API Client
```tsx
// lib/api.ts — typed fetch wrapper
export async function getTaskTree(projectId: string): Promise<Task[]> {
  const res = await fetch(`${API_URL}/projects/${projectId}/tasks/tree`, {
    headers: await getAuthHeaders(),
    next: { tags: [`tasks-${projectId}`] },
  })
  if (!res.ok) throw new ApiError(res)
  return res.json()
}
```

## Rules

- NEVER use `any` type. Define types in `src/types/`
- NEVER use `// @ts-ignore` or `// @ts-nocheck`
- ALWAYS use `cn()` from `lib/utils` for conditional classNames
- ALWAYS use Shadcn/UI components — NEVER install MUI, Ant Design, or others
- ALWAYS define API types in `src/types/api.ts`
- ALWAYS handle loading states (`loading.tsx` or Skeleton components)
- ALWAYS handle error states (`error.tsx` or ErrorBoundary)
- Use `useRealtime()` hook to subscribe to WebSocket events for live updates
- Use `usePermissions()` hook to check RBAC before rendering actions
- Form validation: Zod schemas in component files, React Hook Form for state
- File uploads: use `useCallback` with progress tracking via MinIO pre-signed URLs
- NEVER fetch data in `useEffect` when it can be done in a Server Component
