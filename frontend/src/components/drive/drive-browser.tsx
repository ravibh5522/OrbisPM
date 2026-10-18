"use client";

import { DriveDropzone } from "@/components/drive/drive-dropzone";
import {
  DriveItemList,
  type DriveAction,
  type DriveListView,
} from "@/components/drive/drive-item-list";
import { MoveDialog } from "@/components/drive/move-dialog";
import { NewFolderDialog } from "@/components/drive/new-folder-dialog";
import { RenameDialog } from "@/components/drive/rename-dialog";
import { ShareDialog } from "@/components/drive/share-dialog";
import { FilePreview } from "@/components/files/file-preview";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, EmptyState } from "@/components/ui/shared";
import { Skeleton } from "@/components/ui/skeleton";
import {
  downloadDriveItem,
  getDriveItemUrl,
  ROLE_RANK,
  useDriveItem,
  useDriveItems,
  useDriveRecent,
  useDriveSearch,
  useDriveSharedWithMe,
  useDriveSpaces,
  useDriveTrash,
  useRestoreDriveItem,
  useTrashDriveItem,
} from "@/hooks/use-drive";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useDriveUploadStore } from "@/stores/drive-upload-store";
import { useUIStore } from "@/stores/ui-store";
import type { DriveItem, DriveScope, DriveSpace } from "@/types/domain";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Clock,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Search,
  Share2,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

type VirtualView = "shared" | "recent" | "trash";

type DriveLocation =
  | {
      kind: "space";
      scope: DriveScope;
      scopeId: string;
      folderId: string | null;
      /** Space name when it isn't in /spaces (reached through a share). */
      label?: string;
    }
  | { kind: VirtualView };

const VIRTUAL_VIEWS: { kind: VirtualView; label: string; icon: React.ReactNode }[] = [
  { kind: "shared", label: "Shared with me", icon: <Share2 className="w-4 h-4" /> },
  { kind: "recent", label: "Recent", icon: <Clock className="w-4 h-4" /> },
  { kind: "trash", label: "Trash", icon: <Trash2 className="w-4 h-4" /> },
];

const SCOPE_ICON: Record<DriveScope, React.ReactNode> = {
  user: <HardDrive className="w-4 h-4" />,
  org: <Building2 className="w-4 h-4" />,
  team: <Users className="w-4 h-4" />,
  project: <FolderKanban className="w-4 h-4" />,
};

const SCOPE_FALLBACK_NAME: Record<DriveScope, string> = {
  user: "My files",
  org: "Organization",
  team: "Team files",
  project: "Project files",
};

const spaceKey = (scope: DriveScope, scopeId: string) => `${scope}:${scopeId}`;

const locationKey = (loc: DriveLocation) =>
  loc.kind === "space" ? spaceKey(loc.scope, loc.scopeId) : loc.kind;

function parseLocationKey(
  key: string,
  spaces: DriveSpace[],
): DriveLocation | null {
  if (key === "shared" || key === "recent" || key === "trash")
    return { kind: key };
  const s = spaces.find((sp) => spaceKey(sp.scope, sp.scope_id) === key);
  return s
    ? { kind: "space", scope: s.scope, scopeId: s.scope_id, folderId: null }
    : null;
}

const EMPTY_COPY: Record<DriveListView, { title: string; description: string }> = {
  space: {
    title: "This folder is empty",
    description: "Drop files here or use Upload to add some.",
  },
  shared: {
    title: "Nothing shared with you yet",
    description: "Files and folders others share with you will show up here.",
  },
  recent: {
    title: "No recent files",
    description: "Files you upload or change will show up here.",
  },
  trash: {
    title: "Trash is empty",
    description: "Items you move to trash can be restored from here.",
  },
  search: { title: "No matches", description: "Try a different name." },
};

type DialogState =
  | { type: "new-folder" }
  | { type: "share" | "rename" | "move" | "trash"; item: DriveItem }
  | null;

interface DriveBrowserProps {
  scope?: DriveScope;
  scopeId?: string;
  lockScope?: boolean;
  density: "panel" | "page";
  /** Deep link: open this item's folder, and preview it if it is a file. */
  initialItemId?: string;
}

export function DriveBrowser({
  scope,
  scopeId,
  lockScope,
  density,
  initialItemId,
}: DriveBrowserProps) {
  const orgId = useAuthStore((s) => s.currentOrg?.id) || "";
  const qc = useQueryClient();
  const driveLastSpace = useUIStore((s) => s.driveLastSpace);
  const setDriveLastSpace = useUIStore((s) => s.setDriveLastSpace);

  const spacesQ = useDriveSpaces();
  const spaces = spacesQ.data ?? [];
  // The personal space's scope_id is the caller's user id (API contract).
  const meId = spaces.find((s) => s.scope === "user")?.scope_id;

  const [loc, setLoc] = useState<DriveLocation | null>(
    scope && scopeId
      ? { kind: "space", scope, scopeId, folderId: null }
      : null,
  );
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [preview, setPreview] = useState<DriveItem | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const navigate = useCallback(
    (next: DriveLocation) => {
      setLoc(next);
      setQuery("");
      if (!lockScope) setDriveLastSpace(locationKey(next));
    },
    [lockScope, setDriveLastSpace],
  );

  // Deep link (?item=): jump to the item's folder once, then preview files.
  const deep = useDriveItem(initialItemId);
  const deepHandled = useRef(false);
  useEffect(() => {
    if (deepHandled.current) return;
    if (deep.data) {
      deepHandled.current = true;
      const { item, space } = deep.data;
      setLoc({
        kind: "space",
        scope: space.scope,
        scopeId: space.scope_id,
        folderId: item.kind === "folder" ? item.id : item.parent_id,
        label: space.name,
      });
      if (item.kind === "file") setPreview(item);
    } else if (deep.isError) {
      deepHandled.current = true;
      toast.error("That file isn't available or you don't have access.");
    }
  }, [deep.data, deep.isError]);

  // Default location once spaces are known: last used, else My files. A
  // pending deep link wins, so don't race it.
  const waitingForDeepLink = !!initialItemId && !deep.isError;
  useEffect(() => {
    if (loc || !spacesQ.data || waitingForDeepLink) return;
    const first = spacesQ.data[0];
    setLoc(
      (driveLastSpace && parseLocationKey(driveLastSpace, spacesQ.data)) ||
        (first
          ? {
              kind: "space",
              scope: first.scope,
              scopeId: first.scope_id,
              folderId: null,
            }
          : { kind: "shared" }),
    );
  }, [loc, spacesQ.data, driveLastSpace, waitingForDeepLink]);

  const inSpace = loc?.kind === "space";
  const searching = debounced.length >= 2;
  const spaceLoc = loc?.kind === "space" ? loc : null;
  const space = spaceLoc
    ? spaces.find(
        (s) => s.scope === spaceLoc.scope && s.scope_id === spaceLoc.scopeId,
      )
    : undefined;
  // Items reached through a share may sit in a space the user can't open.
  const rootReachable = lockScope || !!space || !spacesQ.data;
  const rootName =
    space?.name ??
    spaceLoc?.label ??
    (spaceLoc ? SCOPE_FALLBACK_NAME[spaceLoc.scope] : "");

  const itemsQ = useDriveItems(
    spaceLoc?.scope,
    spaceLoc?.scopeId,
    spaceLoc?.folderId ?? null,
    inSpace && !searching,
  );
  const sharedQ = useDriveSharedWithMe(loc?.kind === "shared" && !searching);
  const recentQ = useDriveRecent(loc?.kind === "recent" && !searching);
  const trashQ = useDriveTrash(loc?.kind === "trash" && !searching);
  const searchQ = useDriveSearch(debounced, spaceLoc?.scope, spaceLoc?.scopeId);

  const trash = useTrashDriveItem();
  const restore = useRestoreDriveItem();

  const view: DriveListView = searching
    ? "search"
    : (loc?.kind ?? "space");
  const list =
    view === "search"
      ? { items: searchQ.data, q: searchQ }
      : view === "space"
        ? { items: itemsQ.data?.pages.flatMap((p) => p.items), q: itemsQ }
        : view === "shared"
          ? { items: sharedQ.data?.pages.flatMap((p) => p.items), q: sharedQ }
          : view === "recent"
            ? { items: recentQ.data, q: recentQ }
            : { items: trashQ.data, q: trashQ };
  const infinite = view === "space" ? itemsQ : view === "shared" ? sharedQ : null;

  const firstPage = itemsQ.data?.pages[0];
  const listRole = firstPage?.my_role;
  const breadcrumbs = firstPage?.breadcrumbs ?? [];
  const canEdit =
    view === "space" && !!listRole && ROLE_RANK[listRole] >= ROLE_RANK.editor;

  const onFiles = (files: File[]) => {
    if (!spaceLoc || !canEdit) return;
    useDriveUploadStore.getState().enqueue(
      orgId,
      {
        scope: spaceLoc.scope,
        scope_id: spaceLoc.scopeId,
        parent_id: spaceLoc.folderId,
      },
      files,
      () => qc.invalidateQueries({ queryKey: ["drive", orgId] }),
    );
  };

  const openItem = (item: DriveItem) => {
    if (item.kind === "file") return setPreview(item);
    navigate({
      kind: "space",
      scope: item.scope,
      scopeId: item.scope_id,
      folderId: item.id,
      label: item.space_name ?? spaceLoc?.label,
    });
  };

  const onAction = (action: Exclude<DriveAction, "open">, item: DriveItem) => {
    if (action === "download") {
      downloadDriveItem(orgId, item.id).catch(() =>
        toast.error("Download failed"),
      );
    } else if (action === "restore") {
      restore.mutate(item.id, {
        onSuccess: () => toast.success(`Restored "${item.name}"`),
      });
    } else {
      setDialog({ type: action, item });
    }
  };

  const previewId = preview?.id;
  const getPreviewUrl = useCallback(
    (d: "inline" | "attachment") => getDriveItemUrl(orgId, previewId!, d),
    [orgId, previewId],
  );

  const isPanel = density === "panel";
  const showSpaceList = density === "page" && !lockScope;
  const notFound =
    list.q.error instanceof ApiError && list.q.error.status === 404;

  const spaceSelect = !lockScope && (
    <select
      aria-label="Space"
      className={cn(
        "select select-bordered select-sm",
        isPanel ? "w-full" : "w-full sm:w-44 sm:shrink-0",
        showSpaceList && "lg:hidden",
      )}
      value={loc ? locationKey(loc) : ""}
      onChange={(e) => {
        const next = parseLocationKey(e.target.value, spaces);
        if (next) navigate(next);
      }}
    >
      {!loc && <option value="">Loading...</option>}
      {spaceLoc && !space && (
        <option value={locationKey(spaceLoc)}>{rootName}</option>
      )}
      <optgroup label="Views">
        {spaces
          .filter((s) => s.scope === "user")
          .map((s) => (
            <option key={s.scope_id} value={spaceKey(s.scope, s.scope_id)}>
              {s.name}
            </option>
          ))}
        {VIRTUAL_VIEWS.map((v) => (
          <option key={v.kind} value={v.kind}>
            {v.label}
          </option>
        ))}
      </optgroup>
      {(["org", "team", "project"] as DriveScope[]).map((sc) => {
        const group = spaces.filter((s) => s.scope === sc);
        if (group.length === 0) return null;
        return (
          <optgroup
            key={sc}
            label={sc === "org" ? "Organization" : sc === "team" ? "Teams" : "Projects"}
          >
            {group.map((s) => (
              <option key={s.scope_id} value={spaceKey(s.scope, s.scope_id)}>
                {s.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );

  return (
    <div className="flex h-full min-h-0">
      {showSpaceList && (
        <SpaceList
          spaces={spaces}
          loading={spacesQ.isLoading}
          activeKey={loc ? locationKey(loc) : null}
          onSelect={navigate}
        />
      )}

      <DriveDropzone
        enabled={canEdit}
        onFiles={onFiles}
        inputRef={inputRef}
        className="flex flex-1 min-w-0 flex-col"
      >
        {/* Toolbar */}
        <div
          className={cn(
            "flex flex-col gap-2 border-b border-base-200",
            isPanel ? "p-3" : "px-3 py-3 md:px-4",
          )}
        >
          {isPanel && spaceSelect}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            {!isPanel && spaceSelect}
            <label className="input input-bordered input-sm flex flex-1 min-w-[10rem] items-center gap-2">
              <Search className="w-4 h-4 text-base-content/40 shrink-0" />
              <input
                type="search"
                aria-label="Search files"
                className="grow min-w-0"
                placeholder={
                  inSpace ? `Search in ${rootName || "this space"}` : "Search all files"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.preventDefault();
                    setQuery("");
                  }
                }}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="text-base-content/40 hover:text-base-content/70"
                  onClick={() => setQuery("")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </label>
            {canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(isPanel && "btn-square")}
                  aria-label="New folder"
                  title="New folder"
                  onClick={() => setDialog({ type: "new-folder" })}
                >
                  <FolderPlus className="w-4 h-4" />
                  {!isPanel && <span className="hidden sm:inline">New folder</span>}
                </Button>
                <Button
                  size="sm"
                  className={cn(isPanel && "btn-square")}
                  aria-label="Upload files"
                  title="Upload files"
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="w-4 h-4" />
                  {!isPanel && <span className="hidden sm:inline">Upload</span>}
                </Button>
              </>
            )}
          </div>

          {/* Breadcrumb */}
          {spaceLoc && !searching && (
            <nav
              aria-label="Folder path"
              className="flex items-center gap-1 min-w-0 text-sm text-base-content/60"
            >
              <button
                type="button"
                className={cn(
                  "truncate max-w-[12rem] hover:text-base-content transition-colors",
                  spaceLoc.folderId === null && "font-semibold text-base-content",
                )}
                onClick={() =>
                  rootReachable
                    ? navigate({ ...spaceLoc, folderId: null })
                    : navigate({ kind: "shared" })
                }
              >
                {rootReachable ? rootName : "Shared with me"}
              </button>
              {breadcrumbs.map((b, i) => {
                const last = i === breadcrumbs.length - 1;
                return (
                  <span key={b.id} className="flex items-center gap-1 min-w-0">
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 text-base-content/30" />
                    <button
                      type="button"
                      aria-current={last ? "page" : undefined}
                      className={cn(
                        "truncate max-w-[10rem] hover:text-base-content transition-colors",
                        last && "font-semibold text-base-content",
                      )}
                      onClick={() => navigate({ ...spaceLoc, folderId: b.id })}
                    >
                      {b.name}
                    </button>
                  </span>
                );
              })}
            </nav>
          )}
          {!spaceLoc && !searching && loc && (
            <p className="text-sm font-semibold">
              {VIRTUAL_VIEWS.find((v) => v.kind === loc.kind)?.label}
            </p>
          )}
          {searching && (
            <p className="text-sm text-base-content/60">
              Results for &ldquo;{debounced}&rdquo;
            </p>
          )}
        </div>

        {/* Body */}
        {!loc || list.q.isLoading ? (
          <ListSkeleton />
        ) : list.q.isError ? (
          <EmptyState
            icon={<AlertTriangle className="w-10 h-10 text-warning" />}
            title={notFound ? "This folder isn't available" : "Couldn't load files"}
            description={
              notFound
                ? "It may have been moved, deleted or unshared."
                : list.q.error instanceof Error
                  ? list.q.error.message
                  : undefined
            }
            action={
              notFound && spaces[0] ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate({
                      kind: "space",
                      scope: spaces[0].scope,
                      scopeId: spaces[0].scope_id,
                      folderId: null,
                    })
                  }
                >
                  Go to {spaces[0].name}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => list.q.refetch()}
                >
                  Try again
                </Button>
              )
            }
          />
        ) : (list.items ?? []).length === 0 ? (
          <div className="flex-1 overflow-y-auto">
            <EmptyState
              icon={
                view === "trash" ? (
                  <Trash2 className="w-10 h-10" />
                ) : view === "search" ? (
                  <Search className="w-10 h-10" />
                ) : (
                  <FolderOpen className="w-10 h-10" />
                )
              }
              title={EMPTY_COPY[view].title}
              description={
                view === "space" && !canEdit
                  ? "Nothing has been added here yet."
                  : EMPTY_COPY[view].description
              }
              action={
                canEdit && (
                  <Button size="sm" onClick={() => inputRef.current?.click()}>
                    <Upload className="w-4 h-4" /> Upload files
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <DriveItemList
            items={list.items ?? []}
            density={density}
            view={view}
            meId={meId}
            onOpen={openItem}
            onAction={onAction}
            hasMore={!!infinite?.hasNextPage}
            loadingMore={!!infinite?.isFetchingNextPage}
            onLoadMore={() => infinite?.fetchNextPage()}
          />
        )}
      </DriveDropzone>

      {preview && (
        <FilePreview
          file={{
            name: preview.name,
            mimeType: preview.mime_type,
            size: preview.size_bytes,
          }}
          getUrl={getPreviewUrl}
          onClose={() => setPreview(null)}
        />
      )}

      {dialog?.type === "new-folder" && spaceLoc && (
        <NewFolderDialog
          scope={spaceLoc.scope}
          scopeId={spaceLoc.scopeId}
          parentId={spaceLoc.folderId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "rename" && (
        <RenameDialog item={dialog.item} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === "share" && (
        <ShareDialog
          item={dialog.item}
          meId={meId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "move" && (
        <MoveDialog
          item={dialog.item}
          spaceName={rootName}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "trash" &&
        // ConfirmDialog doesn't portal; the panel's slide transform would
        // otherwise trap its fixed overlay inside the drawer.
        createPortal(
          <ConfirmDialog
            open
            onClose={() => setDialog(null)}
            onConfirm={() =>
              trash.mutate(dialog.item.id, {
                onSuccess: () => {
                  toast.success(`Moved "${dialog.item.name}" to trash`);
                  setDialog(null);
                },
              })
            }
            title="Move to trash?"
            message={`"${dialog.item.name}"${dialog.item.kind === "folder" ? " and everything in it" : ""} will be moved to trash. You can restore it from Trash.`}
            confirmLabel="Move to trash"
            loading={trash.isPending}
          />,
          document.body,
        )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex-1 p-3 space-y-1" aria-busy="true" aria-label="Loading files">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 h-10 px-1">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className={cn("h-4", i % 2 ? "w-1/2" : "w-2/3")} />
        </div>
      ))}
    </div>
  );
}

function SpaceList({
  spaces,
  loading,
  activeKey,
  onSelect,
}: {
  spaces: DriveSpace[];
  loading: boolean;
  activeKey: string | null;
  onSelect: (loc: DriveLocation) => void;
}) {
  const item = (
    key: string,
    label: string,
    icon: React.ReactNode,
    loc: DriveLocation,
  ) => (
    <li key={key}>
      <button
        type="button"
        aria-current={activeKey === key ? "page" : undefined}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors",
          activeKey === key
            ? "bg-primary/10 text-primary font-medium"
            : "text-base-content/80 hover:bg-base-200",
        )}
        onClick={() => onSelect(loc)}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </button>
    </li>
  );
  const asLoc = (s: DriveSpace): DriveLocation => ({
    kind: "space",
    scope: s.scope,
    scopeId: s.scope_id,
    folderId: null,
  });
  const section = (sc: DriveScope, title: string) => {
    const group = spaces.filter((s) => s.scope === sc);
    if (group.length === 0) return null;
    return (
      <div key={sc}>
        <p className="px-3 pt-4 pb-1 text-[11px] font-bold uppercase tracking-widest text-base-content/40">
          {title}
        </p>
        <ul className="space-y-0.5">
          {group.map((s) =>
            item(spaceKey(s.scope, s.scope_id), s.name, SCOPE_ICON[sc], asLoc(s)),
          )}
        </ul>
      </div>
    );
  };

  return (
    <nav
      aria-label="Drive spaces"
      className="hidden lg:block w-56 shrink-0 overflow-y-auto border-r border-base-200 p-2"
    >
      {loading ? (
        <div className="space-y-2 p-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <>
          <ul className="space-y-0.5">
            {spaces
              .filter((s) => s.scope === "user")
              .map((s) =>
                item(spaceKey(s.scope, s.scope_id), s.name, SCOPE_ICON.user, asLoc(s)),
              )}
            {VIRTUAL_VIEWS.map((v) =>
              item(v.kind, v.label, v.icon, { kind: v.kind }),
            )}
          </ul>
          {section("org", "Organization")}
          {section("team", "Teams")}
          {section("project", "Projects")}
        </>
      )}
    </nav>
  );
}
