"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form-fields";
import { api } from "@/lib/api";
import { useChatStore } from "@/stores/chat-store";
import { useQueryClient } from "@tanstack/react-query";
import { Hash, X } from "lucide-react";
import { useState } from "react";

interface CreateChannelModalProps {
  open: boolean;
  onClose: () => void;
  /** Team ID — channel will be created inside this team */
  teamId?: string;
  /** Group channel ID — channel will be created as a sub-channel of this group */
  groupChannelId?: string;
}

export function CreateChannelModal({
  open,
  onClose,
  teamId,
  groupChannelId,
}: CreateChannelModalProps) {
  const addChannel = useChatStore((s) => s.addChannel);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const parentLabel = teamId
    ? "team"
    : groupChannelId
      ? "group"
      : "conversation";

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Channel name is required");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const channel = await api.chat.channels.create({
        name: name.trim(),
        description: description.trim(),
        type: "team",
        ...(teamId ? { team_id: teamId } : {}),
      });
      addChannel(channel);
      setActiveChannel(channel.id);
      qc.invalidateQueries({ queryKey: ["chat-sidebar"] });
      handleClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create channel";
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setError("");
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md bg-base-100 rounded-2xl shadow-2xl border border-base-200 p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold">Create Channel</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="btn-square"
            onClick={handleClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-xs text-base-content/50 mb-4">
          This channel will be created inside this {parentLabel}.
        </p>

        {error && (
          <Alert variant="error" className="mb-3">
            {error}
          </Alert>
        )}

        {/* Name */}
        <div className="form-control mb-3">
          <label className="label">
            <span className="label-text text-sm font-medium">Channel Name</span>
          </label>
          <Input
            type="text"
            placeholder="e.g. general, design, announcements"
            className="w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
        </div>

        {/* Description */}
        <div className="form-control mb-4">
          <label className="label">
            <span className="label-text text-sm font-medium">
              Description{" "}
              <span className="text-base-content/40">(optional)</span>
            </span>
          </label>
          <Textarea
            placeholder="What's this channel about?"
            className="w-full resize-none"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            loading={creating}
          >
            {!creating && "Create Channel"}
          </Button>
        </div>
      </div>
    </div>
  );
}
