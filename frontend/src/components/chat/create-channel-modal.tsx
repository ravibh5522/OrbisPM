"use client";

import { api } from "@/lib/api";
import { useChatStore } from "@/stores/chat-store";
import { Hash, Lock, Users, X } from "lucide-react";
import { useState } from "react";

interface CreateChannelModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateChannelModal({ open, onClose }: CreateChannelModalProps) {
  const addChannel = useChatStore((s) => s.addChannel);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [channelType, setChannelType] = useState<"group" | "team" | "project">(
    "group",
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

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
        type: channelType,
      });
      addChannel(channel);
      setActiveChannel(channel.id);
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
    setChannelType("group");
    setError("");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md bg-base-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Create Channel</h3>
          <button
            className="btn btn-ghost btn-sm btn-square"
            onClick={handleClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="alert alert-error alert-sm mb-3">
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Channel Type */}
        <div className="form-control mb-3">
          <label className="label">
            <span className="label-text text-sm font-medium">Type</span>
          </label>
          <div className="flex gap-2">
            {(
              [
                {
                  value: "group",
                  label: "Group",
                  icon: <Hash className="w-4 h-4" />,
                },
                {
                  value: "team",
                  label: "Team",
                  icon: <Users className="w-4 h-4" />,
                },
                {
                  value: "project",
                  label: "Project",
                  icon: <Lock className="w-4 h-4" />,
                },
              ] as const
            ).map((t) => (
              <button
                key={t.value}
                onClick={() => setChannelType(t.value)}
                className={`btn btn-sm flex-1 ${
                  channelType === t.value
                    ? "btn-primary"
                    : "btn-ghost border border-base-200"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="form-control mb-3">
          <label className="label">
            <span className="label-text text-sm font-medium">Channel Name</span>
          </label>
          <input
            type="text"
            placeholder="e.g. general, design-team, project-alpha"
            className="input input-bordered w-full"
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
          <textarea
            placeholder="What's this channel about?"
            className="textarea textarea-bordered w-full resize-none"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={handleClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={creating || !name.trim()}
          >
            {creating ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              "Create Channel"
            )}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={handleClose} />
    </div>
  );
}
