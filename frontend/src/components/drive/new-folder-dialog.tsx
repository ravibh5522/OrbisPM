"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import { useCreateDriveFolder } from "@/hooks/use-drive";
import type { DriveScope } from "@/types/domain";
import { useState } from "react";
import { toast } from "sonner";

interface NewFolderDialogProps {
  onClose: () => void;
  scope: DriveScope;
  scopeId: string;
  parentId: string | null;
}

/** Mount only while open. */
export function NewFolderDialog({
  onClose,
  scope,
  scopeId,
  parentId,
}: NewFolderDialogProps) {
  const [name, setName] = useState("");
  const create = useCreateDriveFolder();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { scope, scope_id: scopeId, parent_id: parentId, name: trimmed },
      {
        onSuccess: (folder) => {
          toast.success(`Created "${folder.name}"`);
          onClose();
        },
      },
    );
  };

  return (
    <Modal open onClose={onClose} title="New folder" className="max-w-sm">
      <form onSubmit={submit}>
        <Input
          name="drive-folder-name"
          aria-label="Folder name"
          placeholder="Untitled folder"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={255}
          autoFocus
        />
        <div className="modal-action">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()} loading={create.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
