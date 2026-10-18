"use client";

import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/shared";
import { ROLE_RANK } from "@/hooks/use-drive";
import { cn, formatBytes } from "@/lib/utils";
import type { DriveItem } from "@/types/domain";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatDistanceToNow } from "date-fns";
import {
  ArchiveRestore,
  Download,
  EllipsisVertical,
  Eye,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderInput,
  FolderOpen,
  Pencil,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type DriveListView = "space" | "shared" | "recent" | "trash" | "search";
export type DriveAction =
  | "open"
  | "download"
  | "share"
  | "rename"
  | "move"
  | "trash"
  | "restore";

const VIRTUALIZE_AFTER = 100;

const SPREADSHEET_EXT = new Set(["xls", "xlsx", "csv", "tsv", "ods"]);
const ARCHIVE_EXT = new Set(["zip", "tar", "gz", "tgz", "7z", "rar", "bz2"]);
const CODE_EXT = new Set([
  "js", "jsx", "ts", "tsx", "json", "py", "go", "rs", "java", "kt", "rb",
  "php", "c", "h", "cpp", "cs", "swift", "sh", "sql", "yml", "yaml", "toml",
  "xml", "html", "css", "scss",
]);
const DOC_EXT = new Set(["pdf", "doc", "docx", "odt", "rtf", "txt", "md"]);

export function DriveItemIcon({
  item,
  className = "w-5 h-5",
}: {
  item: Pick<DriveItem, "kind" | "name" | "mime_type">;
  className?: string;
}) {
  if (item.kind === "folder")
    return <Folder className={cn(className, "text-primary fill-primary/15")} />;
  const m = item.mime_type ?? "";
  const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
  if (m.startsWith("image/"))
    return <FileImage className={cn(className, "text-secondary")} />;
  if (m.startsWith("video/"))
    return <FileVideo className={cn(className, "text-secondary")} />;
  if (m.startsWith("audio/"))
    return <FileAudio className={cn(className, "text-accent")} />;
  if (m.includes("spreadsheet") || m.includes("excel") || SPREADSHEET_EXT.has(ext))
    return <FileSpreadsheet className={cn(className, "text-success")} />;
  if (m.includes("zip") || m.includes("compressed") || ARCHIVE_EXT.has(ext))
    return <FileArchive className={cn(className, "text-warning")} />;
  if (CODE_EXT.has(ext) || m.includes("json") || m.includes("javascript"))
    return <FileCode className={cn(className, "text-info")} />;
  if (m === "application/pdf")
    return <FileText className={cn(className, "text-error")} />;
  if (m.startsWith("text/") || m.includes("word") || DOC_EXT.has(ext))
    return <FileText className={cn(className, "text-info")} />;
  return <File className={cn(className, "text-base-content/50")} />;
}

function actionsFor(
  item: DriveItem,
  view: DriveListView,
  meId: string | undefined,
): DriveAction[] {
  if (view === "trash") return ["restore"];
  const rank = ROLE_RANK[item.my_role];
  const actions: DriveAction[] = ["open"];
  if (item.kind === "file") actions.push("download");
  if (rank >= ROLE_RANK.editor) actions.push("share", "rename");
  // Move needs the space's folder tree, which only the space view browses.
  if (rank >= ROLE_RANK.editor && view === "space") actions.push("move");
  if (rank >= ROLE_RANK.manager || item.created_by === meId)
    actions.push("trash");
  return actions;
}

const ACTION_META: Record<
  DriveAction,
  { label: (item: DriveItem) => string; icon: React.ReactNode; danger?: boolean }
> = {
  open: {
    label: (i) => (i.kind === "folder" ? "Open" : "Preview"),
    icon: <Eye className="w-4 h-4" />,
  },
  download: { label: () => "Download", icon: <Download className="w-4 h-4" /> },
  share: { label: () => "Share", icon: <Share2 className="w-4 h-4" /> },
  rename: { label: () => "Rename", icon: <Pencil className="w-4 h-4" /> },
  move: { label: () => "Move", icon: <FolderInput className="w-4 h-4" /> },
  trash: {
    label: () => "Move to trash",
    icon: <Trash2 className="w-4 h-4" />,
    danger: true,
  },
  restore: {
    label: () => "Restore",
    icon: <ArchiveRestore className="w-4 h-4" />,
  },
};

interface DriveItemListProps {
  items: DriveItem[];
  density: "panel" | "page";
  view: DriveListView;
  meId?: string;
  onOpen: (item: DriveItem) => void;
  onAction: (action: Exclude<DriveAction, "open">, item: DriveItem) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

export function DriveItemList({
  items,
  density,
  view,
  meId,
  onOpen,
  onAction,
  hasMore,
  loadingMore,
  onLoadMore,
}: DriveItemListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    item: DriveItem;
    anchor: MenuAnchor;
    returnFocus: HTMLElement | null;
  } | null>(null);
  const lastPointer = useRef<string>("mouse");

  const rowHeight = density === "page" ? 48 : 44;
  const virtual = items.length > VIRTUALIZE_AFTER;
  const virtualizer = useVirtualizer({
    count: virtual ? items.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  const focusRow = (index: number) => {
    if (index < 0 || index >= items.length) return;
    const focus = () =>
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-drive-row="${index}"]`)
        ?.focus();
    if (virtual) {
      virtualizer.scrollToIndex(index);
      requestAnimationFrame(focus);
    } else {
      focus();
    }
  };

  const openMenuAt = (
    item: DriveItem,
    anchor: MenuAnchor,
    returnFocus: HTMLElement | null,
  ) => setMenu({ item, anchor, returnFocus });

  const isPage = density === "page";
  const cols = isPage
    ? "grid-cols-[minmax(0,1fr)_2.5rem] md:grid-cols-[minmax(0,1fr)_10rem_10rem_5.5rem_2.5rem]"
    : "grid-cols-[minmax(0,1fr)_auto_2.5rem]";

  const renderRow = (item: DriveItem, index: number) => {
    const sub = item.space_name;
    return (
      <div
        key={item.id}
        role="listitem"
        tabIndex={0}
        data-drive-row={index}
        aria-label={`${item.kind === "folder" ? "Folder" : "File"} ${item.name}`}
        style={{ height: rowHeight }}
        className={cn(
          "grid items-center gap-3 px-3 border-b border-base-200/60 cursor-default select-none outline-none transition-colors",
          // Solid hover: orbis themes force any bg-base-200/NN to solid base-200.
          "hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
          selectedId === item.id && "bg-primary/10 hover:bg-primary/15",
          view === "trash" && "opacity-80",
          cols,
        )}
        onPointerDown={(e) => {
          lastPointer.current = e.pointerType;
        }}
        onClick={() => {
          setSelectedId(item.id);
          // Touch devices have no reliable double-tap, so a tap opens.
          if (lastPointer.current === "touch" && view !== "trash") onOpen(item);
        }}
        onDoubleClick={() => view !== "trash" && onOpen(item)}
        onContextMenu={(e) => {
          e.preventDefault();
          setSelectedId(item.id);
          openMenuAt(
            item,
            { left: e.clientX, top: e.clientY, bottom: e.clientY },
            e.currentTarget,
          );
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" && view !== "trash") {
            e.preventDefault();
            onOpen(item);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            focusRow(index + 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            focusRow(index - 1);
          } else if (e.key === "Delete" && actionsFor(item, view, meId).includes("trash")) {
            e.preventDefault();
            onAction("trash", item);
          }
        }}
      >
        {/* Name */}
        <div className="flex items-center gap-3 min-w-0">
          <DriveItemIcon item={item} className="w-5 h-5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" title={item.name}>
              {item.name}
            </p>
            {sub && (
              <p className="text-xs text-base-content/50 truncate">{sub}</p>
            )}
          </div>
          {item.shared && (
            <span title="Shared" aria-label="Shared" className="shrink-0">
              <Users className="w-3.5 h-3.5 text-base-content/40" />
            </span>
          )}
        </div>

        {isPage ? (
          <>
            <div className="hidden md:flex items-center gap-2 min-w-0">
              {item.creator && (
                <>
                  <Avatar
                    name={item.creator.display_name}
                    src={item.creator.avatar_url ?? undefined}
                    size="xs"
                  />
                  <span
                    className="text-sm text-base-content/70 truncate"
                    title={item.creator.display_name}
                  >
                    {item.creator.id === meId ? "You" : item.creator.display_name}
                  </span>
                </>
              )}
            </div>
            <span
              className="hidden md:block text-sm text-base-content/60 truncate"
              title={new Date(item.updated_at).toLocaleString()}
            >
              {formatDistanceToNow(new Date(item.updated_at), {
                addSuffix: true,
              })}
            </span>
            <span className="hidden md:block text-sm text-base-content/60 text-right tabular-nums">
              {item.kind === "file" && item.size_bytes != null
                ? formatBytes(item.size_bytes)
                : "-"}
            </span>
          </>
        ) : (
          <div className="flex items-center">
            {item.creator && (
              <span title={item.creator.display_name}>
                <Avatar
                  name={item.creator.display_name}
                  src={item.creator.avatar_url ?? undefined}
                  size="xs"
                />
              </span>
            )}
          </div>
        )}

        {/* Row menu */}
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square justify-self-end"
          aria-label={`Actions for ${item.name}`}
          aria-haspopup="menu"
          aria-expanded={menu?.item.id === item.id}
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            openMenuAt(
              item,
              { left: r.right - MENU_WIDTH, top: r.top - 4, bottom: r.bottom + 4 },
              e.currentTarget,
            );
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <EllipsisVertical className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
      {isPage && (
        <div
          className={cn(
            "hidden md:grid sticky top-0 z-10 items-center gap-3 px-3 h-9 border-b border-base-200 bg-base-100/90 backdrop-blur text-[11px] font-semibold uppercase tracking-wider text-base-content/60",
            cols,
          )}
          aria-hidden="true"
        >
          <span>Name</span>
          <span>Owner</span>
          <span>Modified</span>
          <span className="text-right">Size</span>
          <span />
        </div>
      )}

      {virtual ? (
        <div
          role="list"
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((v) => (
            <div
              key={v.key}
              role="presentation"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${v.start}px)`,
              }}
            >
              {renderRow(items[v.index], v.index)}
            </div>
          ))}
        </div>
      ) : (
        <div role="list">{items.map(renderRow)}</div>
      )}

      {hasMore && (
        <div className="flex justify-center p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onLoadMore}
            loading={loadingMore}
          >
            Load more
          </Button>
        </div>
      )}

      {menu && (
        <RowMenu
          item={menu.item}
          anchor={menu.anchor}
          actions={actionsFor(menu.item, view, meId)}
          onSelect={(action) => {
            const item = menu.item;
            setMenu(null);
            if (action === "open") onOpen(item);
            else onAction(action, item);
          }}
          onClose={() => {
            menu.returnFocus?.focus();
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

const MENU_WIDTH = 192;

/** Menu opens below `bottom`; when it would overflow it ends at `top` instead. */
interface MenuAnchor {
  left: number;
  top: number;
  bottom: number;
}

/**
 * Portaled so it is never clipped by the scroll container and escapes the
 * Drive panel's transform (which would otherwise re-anchor `fixed`).
 */
function RowMenu({
  item,
  anchor,
  actions,
  onSelect,
  onClose,
}: {
  item: DriveItem;
  anchor: MenuAnchor;
  actions: DriveAction[];
  onSelect: (a: DriveAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom });

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    const left = Math.min(
      Math.max(8, anchor.left),
      window.innerWidth - MENU_WIDTH - 8,
    );
    const top =
      anchor.bottom + h > window.innerHeight - 8
        ? Math.max(8, anchor.top - h)
        : anchor.bottom;
    setPos({ left, top });
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onScroll);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const move = (delta: number) => {
    const els = Array.from(
      ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [],
    );
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + delta + els.length) % els.length]?.focus();
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${item.name}`}
      style={{ left: pos.left, top: pos.top, width: MENU_WIDTH }}
      className="fixed z-[70] rounded-box border border-base-200 bg-base-100/95 backdrop-blur-[20px] shadow-lg p-1"
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {actions.map((a) => {
        const meta = ACTION_META[a];
        return (
          <button
            key={a}
            type="button"
            role="menuitem"
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg outline-none transition-colors hover:bg-base-200 focus:bg-base-200",
              meta.danger && "text-error",
            )}
            onClick={() => onSelect(a)}
          >
            {a === "open" && item.kind === "folder" ? (
              <FolderOpen className="w-4 h-4" />
            ) : (
              meta.icon
            )}
            {meta.label(item)}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
