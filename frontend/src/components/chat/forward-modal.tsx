"use client";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form-fields";
import { api } from "@/lib/api";
import type { ChatMessage, OrgMemberInfo } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { Check, Forward, Hash, User, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface ForwardModalProps {
  open: boolean;
  onClose: () => void;
  message: ChatMessage;
}

type Person = { user_id: string; display_name: string };

export function ForwardModal({ open, onClose, message }: ForwardModalProps) {
  const [search, setSearch] = useState("");
  const [channelIds, setChannelIds] = useState<Set<string>>(new Set());
  const [people, setPeople] = useState<Person[]>([]);
  const [mode, setMode] = useState<"separate" | "group">("separate");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const { data: channels } = useQuery({
    queryKey: ["chat-forward-channels"],
    queryFn: async () => (await api.chat.channels.list(100, 0)).data ?? [],
    enabled: open,
  });

  const { data: users } = useQuery({
    queryKey: ["chat-forward-people", search],
    queryFn: async () => await api.chat.users.search(search, 15),
    enabled: open && search.trim().length > 0,
  });

  const filteredChannels = useMemo(() => {
    const list = (channels ?? []).filter((c) => c.id !== message.channel_id);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((c) => c.name?.toLowerCase().includes(q));
  }, [channels, search, message.channel_id]);

  const peopleIds = useMemo(
    () => new Set(people.map((p) => p.user_id)),
    [people],
  );

  const toggleChannel = (id: string) =>
    setChannelIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const togglePerson = (u: OrgMemberInfo) =>
    setPeople((prev) =>
      prev.some((p) => p.user_id === u.user_id)
        ? prev.filter((p) => p.user_id !== u.user_id)
        : [...prev, { user_id: u.user_id, display_name: u.display_name }],
    );

  const reset = () => {
    setChannelIds(new Set());
    setPeople([]);
    setNote("");
    setSearch("");
    setMode("separate");
  };
  const handleClose = () => {
    reset();
    onClose();
  };

  const total = channelIds.size + people.length;

  const deliver = async (channelId: string) => {
    await api.chat.messages.forward(message.id, channelId);
    if (note.trim()) {
      await api.chat.messages.send(channelId, {
        body: note.trim(),
        body_format: "text",
      });
    }
  };

  const handleForward = async () => {
    if (total === 0) return;
    setSending(true);
    let ok = 0;
    let attempts = 0;

    // Channels — always individual targets.
    for (const cid of channelIds) {
      attempts++;
      try {
        await deliver(cid);
        ok++;
      } catch {
        /* aggregated below */
      }
    }

    // People — separate DMs, or one shared group.
    if (people.length > 0) {
      if (mode === "group") {
        attempts++;
        try {
          const name =
            people
              .slice(0, 3)
              .map((p) => p.display_name?.split(" ")[0] || "Member")
              .join(", ") + (people.length > 3 ? ` +${people.length - 3}` : "");
          const group = await api.chat.channels.create({
            name,
            type: "group",
          });
          for (const p of people) {
            try {
              await api.chat.members.add(group.id, p.user_id);
            } catch {
              /* member may already be present */
            }
          }
          await deliver(group.id);
          ok++;
        } catch {
          /* aggregated below */
        }
      } else {
        for (const p of people) {
          attempts++;
          try {
            const dm = await api.chat.channels.getOrCreateDM(p.user_id);
            await deliver(dm.id);
            ok++;
          } catch {
            /* aggregated below */
          }
        }
      }
    }

    setSending(false);
    if (ok === attempts) {
      toast.success(
        mode === "group" && people.length > 0
          ? `Forwarded — group created with ${people.length} people`
          : `Forwarded to ${ok} ${ok === 1 ? "recipient" : "recipients"}`,
      );
      handleClose();
    } else if (ok > 0) {
      toast.warning(`Forwarded to ${ok} of ${attempts} targets`);
    } else {
      toast.error("Couldn't forward the message. Please try again.");
    }
  };

  if (!open) return null;
  const preview = message.body?.trim() || "(attachment)";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-base-300/40"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md bg-base-100 rounded-2xl shadow-2xl border border-base-200 p-6 mx-4 flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Forward className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold">Forward Message</h3>
          </div>
          <Button variant="ghost" size="sm" className="btn-square" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="mb-3 rounded-lg bg-base-200/60 px-3 py-2 text-sm text-base-content/70 line-clamp-2">
          {preview}
        </div>

        <Input
          type="text"
          placeholder="Search people or channels…"
          className="w-full mb-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        <div className="flex-1 overflow-y-auto -mx-2 mb-3 min-h-[6rem]">
          {/* People (search) */}
          {(users ?? []).length > 0 && (
            <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-base-content/40">
              People
            </div>
          )}
          {(users ?? []).map((u) => {
            const sel = peopleIds.has(u.user_id);
            return (
              <button
                key={u.user_id}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm hover:bg-base-200 transition-colors"
                onClick={() => togglePerson(u)}
              >
                <Checkbox on={sel} />
                <User className="w-4 h-4 text-base-content/40 flex-shrink-0" />
                <span className="truncate">{u.display_name}</span>
                <span className="text-xs text-base-content/40 ml-auto truncate">
                  {u.email}
                </span>
              </button>
            );
          })}

          {/* Channels */}
          {filteredChannels.length > 0 && (
            <div className="px-2 pt-2 pb-0.5 text-[10px] uppercase tracking-wide text-base-content/40">
              Channels
            </div>
          )}
          {filteredChannels.map((c) => {
            const sel = channelIds.has(c.id);
            return (
              <button
                key={c.id}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm hover:bg-base-200 transition-colors"
                onClick={() => toggleChannel(c.id)}
              >
                <Checkbox on={sel} />
                <Hash className="w-4 h-4 text-base-content/40 flex-shrink-0" />
                <span className="truncate">{c.name || "Untitled"}</span>
              </button>
            );
          })}

          {search.trim() &&
            (users ?? []).length === 0 &&
            filteredChannels.length === 0 && (
              <p className="text-sm text-base-content/40 text-center py-6">
                No people or channels found
              </p>
            )}
        </div>

        {/* Separate vs group — only when multiple people are chosen */}
        {people.length >= 2 && (
          <div className="flex items-center gap-3 mb-3 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                className="radio radio-xs radio-primary"
                checked={mode === "separate"}
                onChange={() => setMode("separate")}
              />
              Send separately
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                className="radio radio-xs radio-primary"
                checked={mode === "group"}
                onChange={() => setMode("group")}
              />
              <Users className="w-3.5 h-3.5" />
              Send as a group
            </label>
          </div>
        )}

        <Textarea
          placeholder="Add a message (optional)…"
          className="w-full resize-none mb-4"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-base-content/50">{total} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleForward}
              disabled={total === 0 || sending}
              loading={sending}
            >
              {!sending && `Forward${total > 0 ? ` (${total})` : ""}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Checkbox({ on }: { on: boolean }) {
  return (
    <span
      className={
        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 " +
        (on
          ? "bg-primary border-primary text-primary-content"
          : "border-base-content/30")
      }
    >
      {on && <Check className="w-3 h-3" />}
    </span>
  );
}
