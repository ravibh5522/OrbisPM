"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_RANK, useDriveItems, useMoveDriveItem } from "@/hooks/use-drive";
import { cn } from "@/lib/utils";
import type { DriveItem } from "@/types/domain";
import { ChevronRight, Folder, HardDrive } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface MoveDialogProps {
  item: DriveItem;
  spaceName: string;
  onClose: () => void;
}

/** Mount only while open. Targets are limited to the item's own space. */
export function MoveDialog({ item, spaceName, onClose }: MoveDialogProps) {
  const [target, setTarget] = useState<string | null>(item.parent_id);
  const move = useMoveDriveItem();
  const root = useDriveItems(item.scope, item.scope_id, null);
  const rootRole = root.data?.pages[0]?.my_role;
  const rootFolders = root.data?.pages.flatMap((p) => p.items) ?? [];

  const submit = () =>
    move.mutate(
      { id: item.id, parentId: target },
      {
        onSuccess: () => {
          toast.success(`Moved "${item.name}"`);
          onClose();
        },
      },
    );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Move "${item.name}"`}
      className="max-w-md"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={move.isPending}
            disabled={target === item.parent_id}
          >
            Move here
          </Button>
        </>
      }
    >
      <div
        role="tree"
        aria-label="Destination folder"
        className="max-h-80 overflow-y-auto rounded-xl border border-base-200 p-1"
      >
        <TreeRow
          label={spaceName}
          icon={<HardDrive className="w-4 h-4 text-base-content/60" />}
          depth={0}
          selected={target === null}
          disabled={!rootRole || ROLE_RANK[rootRole] < ROLE_RANK.editor}
          expanded
          onSelect={() => setTarget(null)}
        />
        {root.isLoading ? (
          <div className="space-y-1 p-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        ) : (
          rootFolders
            .filter((f) => f.kind === "folder")
            .map((f) => (
              <FolderNode
                key={f.id}
                folder={f}
                moving={item}
                depth={1}
                target={target}
                onSelect={setTarget}
              />
            ))
        )}
      </div>
    </Modal>
  );
}

function FolderNode({
  folder,
  moving,
  depth,
  target,
  onSelect,
}: {
  folder: DriveItem;
  moving: DriveItem;
  depth: number;
  target: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // An item can't move into itself, so its subtree is never offered.
  const isSelf = folder.id === moving.id;
  const children = useDriveItems(
    folder.scope,
    folder.scope_id,
    folder.id,
    expanded && !isSelf,
  );
  const subfolders =
    children.data?.pages
      .flatMap((p) => p.items)
      .filter((f) => f.kind === "folder") ?? [];

  return (
    <>
      <TreeRow
        label={folder.name}
        icon={<Folder className="w-4 h-4 text-primary fill-primary/15" />}
        depth={depth}
        selected={target === folder.id}
        disabled={isSelf || ROLE_RANK[folder.my_role] < ROLE_RANK.editor}
        expanded={expanded}
        onToggle={isSelf ? undefined : () => setExpanded((v) => !v)}
        onSelect={() => onSelect(folder.id)}
      />
      {expanded && children.isLoading && (
        <div style={{ paddingLeft: (depth + 1) * 16 + 8 }} className="py-1">
          <Skeleton className="h-5 w-1/2" />
        </div>
      )}
      {expanded &&
        subfolders.map((f) => (
          <FolderNode
            key={f.id}
            folder={f}
            moving={moving}
            depth={depth + 1}
            target={target}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

function TreeRow({
  label,
  icon,
  depth,
  selected,
  disabled,
  expanded,
  onToggle,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  depth: number;
  selected: boolean;
  disabled: boolean;
  expanded: boolean;
  onToggle?: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={onToggle ? expanded : undefined}
      aria-disabled={disabled}
      className={cn(
        "flex items-center gap-1 rounded-lg pr-2 h-8 text-sm",
        selected ? "bg-primary/10 text-primary font-medium" : "hover:bg-base-200",
        disabled && "opacity-50",
      )}
      style={{ paddingLeft: depth * 16 + 4 }}
    >
      {onToggle ? (
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          onClick={onToggle}
        >
          <ChevronRight
            className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-90")}
          />
        </button>
      ) : (
        <span className="w-6 shrink-0" />
      )}
      <button
        type="button"
        className="flex flex-1 min-w-0 items-center gap-2 text-left disabled:cursor-not-allowed"
        disabled={disabled}
        onClick={onSelect}
      >
        {icon}
        <span className="truncate">{label}</span>
      </button>
    </div>
  );
}
