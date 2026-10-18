"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import { useRenameDriveItem } from "@/hooks/use-drive";
import type { DriveItem } from "@/types/domain";
import { useState } from "react";
import { toast } from "sonner";

interface RenameDialogProps {
  item: DriveItem;
  onClose: () => void;
}

/** Mount only while open: the input is seeded from the item's name. */
export function RenameDialog({ item, onClose }: RenameDialogProps) {
  const [name, setName] = useState(item.name);
  const rename = useRenameDriveItem();
  const trimmed = name.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || trimmed === item.name) return onClose();
    rename.mutate(
      { id: item.id, name: trimmed },
      {
        onSuccess: () => {
          toast.success("Renamed");
          onClose();
        },
      },
    );
  };

  return (
    <Modal open onClose={onClose} title="Rename" className="max-w-sm">
      <form onSubmit={submit}>
        <Input
          name="drive-rename"
          aria-label="New name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={255}
          autoFocus
          onFocus={(e) => {
            // Select the base name so typing keeps the extension.
            const dot = item.kind === "file" ? item.name.lastIndexOf(".") : -1;
            e.target.setSelectionRange(0, dot > 0 ? dot : item.name.length);
          }}
        />
        <div className="modal-action">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!trimmed} loading={rename.isPending}>
            Rename
          </Button>
        </div>
      </form>
    </Modal>
  );
}
