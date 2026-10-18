"use client";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { DriveRole, DriveScope } from "@/types/domain";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

// Query keys all start with ["drive", orgId] so a single invalidation after
// any mutation or socket event refreshes every drive view. Presigned URLs are
// deliberately NOT queries: the cache is persisted and they expire in 5 min.

const PAGE_SIZE = 100;

export const ROLE_RANK: Record<DriveRole, number> = {
  viewer: 0,
  editor: 1,
  manager: 2,
};

function useOrgId(): string {
  return useAuthStore((s) => s.currentOrg?.id) || "";
}

export function useDriveSpaces() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["drive", orgId, "spaces"],
    queryFn: () => api.drive.spaces(orgId),
    select: (d) => d.spaces,
    enabled: !!orgId,
  });
}

export function useDriveItems(
  scope: DriveScope | undefined,
  scopeId: string | undefined,
  parentId: string | null,
  enabled = true,
) {
  const orgId = useOrgId();
  return useInfiniteQuery({
    queryKey: ["drive", orgId, "items", scope, scopeId, parentId ?? "root"],
    queryFn: ({ pageParam }) =>
      api.drive.items(orgId, {
        scope: scope!,
        scope_id: scopeId!,
        parent_id: parentId,
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: enabled && !!orgId && !!scope && !!scopeId,
    retry: false,
  });
}

export function useDriveSharedWithMe(enabled: boolean) {
  const orgId = useOrgId();
  return useInfiniteQuery({
    queryKey: ["drive", orgId, "shared"],
    queryFn: ({ pageParam }) =>
      api.drive.sharedWithMe(orgId, { limit: PAGE_SIZE, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: enabled && !!orgId,
  });
}

export function useDriveRecent(enabled: boolean) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["drive", orgId, "recent"],
    queryFn: () => api.drive.recent(orgId, 50),
    select: (d) => d.items,
    enabled: enabled && !!orgId,
  });
}

export function useDriveTrash(enabled: boolean) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["drive", orgId, "trash"],
    queryFn: () => api.drive.trashList(orgId),
    select: (d) => d.items,
    enabled: enabled && !!orgId,
  });
}

export function useDriveSearch(
  q: string,
  scope?: DriveScope,
  scopeId?: string,
) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["drive", orgId, "search", q, scope, scopeId],
    queryFn: () => api.drive.search(orgId, { q, scope, scope_id: scopeId }),
    select: (d) => d.items,
    enabled: !!orgId && q.length >= 2,
  });
}

export function useDriveItem(id: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["drive", orgId, "item", id],
    queryFn: () => api.drive.item(orgId, id!),
    enabled: !!orgId && !!id,
    retry: false,
  });
}

export function useDriveShares(id: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["drive", orgId, "shares", id],
    queryFn: () => api.drive.shares(orgId, id!),
    select: (d) => d.shares,
    enabled: !!orgId && !!id,
  });
}

export function useDriveUsage() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["drive", orgId, "usage"],
    queryFn: () => api.drive.usage(orgId),
    enabled: !!orgId,
    retry: false,
  });
}

function useDriveMutation<V, R>(fn: (orgId: string, vars: V) => Promise<R>) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => fn(orgId, vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drive", orgId] }),
  });
}

export const useCreateDriveFolder = () =>
  useDriveMutation(
    (
      orgId,
      d: {
        scope: DriveScope;
        scope_id: string;
        parent_id: string | null;
        name: string;
      },
    ) => api.drive.createFolder(orgId, d),
  );

export const useRenameDriveItem = () =>
  useDriveMutation((orgId, v: { id: string; name: string }) =>
    api.drive.rename(orgId, v.id, v.name),
  );

export const useMoveDriveItem = () =>
  useDriveMutation((orgId, v: { id: string; parentId: string | null }) =>
    api.drive.move(orgId, v.id, v.parentId),
  );

export const useTrashDriveItem = () =>
  useDriveMutation((orgId, id: string) => api.drive.trash(orgId, id));

export const useRestoreDriveItem = () =>
  useDriveMutation((orgId, id: string) => api.drive.restore(orgId, id));

export const useShareDriveItem = () =>
  useDriveMutation(
    (orgId, v: { id: string } & Parameters<typeof api.drive.share>[2]) =>
      api.drive.share(orgId, v.id, {
        grantees: v.grantees,
        role: v.role,
        expires_at: v.expires_at,
      }),
  );

export const useUpdateDriveShare = () =>
  useDriveMutation((orgId, v: { shareId: string; role: DriveRole }) =>
    api.drive.updateShare(orgId, v.shareId, v.role),
  );

export const useRevokeDriveShare = () =>
  useDriveMutation((orgId, shareId: string) =>
    api.drive.revokeShare(orgId, shareId),
  );

/** Fetches a fresh presigned URL; never cache the result. */
export async function getDriveItemUrl(
  orgId: string,
  id: string,
  disposition: "inline" | "attachment",
): Promise<string> {
  const res = await api.drive.url(orgId, id, disposition);
  return res.url;
}

export async function downloadDriveItem(orgId: string, id: string) {
  const url = await getDriveItemUrl(orgId, id, "attachment");
  // Same-tab navigation is safe: the URL is served with
  // Content-Disposition: attachment, so the page never unloads.
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.click();
}
