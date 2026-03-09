"use client";

import { useCallback, useRef, useState } from "react";

/** A single undoable/redoable command. */
export interface UndoCommand {
  type: "update" | "delete" | "create" | "reparent" | "bulk-update";
  description: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const MAX_STACK = 50;

/**
 * Hook providing undo/redo capability for task mutations.
 * Returns `pushCommand`, `undo`, `redo`, and keyboard handler.
 */
export function useUndoRedo() {
  const undoStack = useRef<UndoCommand[]>([]);
  const redoStack = useRef<UndoCommand[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const sync = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  const pushCommand = useCallback(
    (cmd: UndoCommand) => {
      undoStack.current.push(cmd);
      if (undoStack.current.length > MAX_STACK) undoStack.current.shift();
      redoStack.current = []; // clear redo on new action
      sync();
    },
    [sync]
  );

  const undo = useCallback(async () => {
    const cmd = undoStack.current.pop();
    if (!cmd) return;
    try {
      await cmd.undo();
      redoStack.current.push(cmd);
    } catch {
      // If undo fails, push the command back
      undoStack.current.push(cmd);
    }
    sync();
  }, [sync]);

  const redo = useCallback(async () => {
    const cmd = redoStack.current.pop();
    if (!cmd) return;
    try {
      await cmd.redo();
      undoStack.current.push(cmd);
    } catch {
      redoStack.current.push(cmd);
    }
    sync();
  }, [sync]);

  return { pushCommand, undo, redo, canUndo, canRedo };
}
