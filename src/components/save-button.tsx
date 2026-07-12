"use client";

import { useState } from "react";
import { Bookmark, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface SaveButtonProps {
  toolId: string;
  title: string;
  content: string;
  sourceMetadata?: unknown;
  label?: string;
}

/** Shared "save output" button — writes to SavedItem via /api/saved-items. */
export function SaveButton({
  toolId,
  title,
  content,
  sourceMetadata,
  label = "Save",
}: SaveButtonProps) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  async function handleSave() {
    setState("saving");
    try {
      const response = await fetch("/api/saved-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolId,
          title: title.slice(0, 300),
          content,
          ...(sourceMetadata !== undefined
            ? { sourceMetadata: JSON.stringify(sourceMetadata) }
            : {}),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Save failed");
      }
      setState("saved");
      toast.success("Saved — find it on your Home dashboard.");
    } catch (error) {
      setState("idle");
      toast.error(error instanceof Error ? error.message : "Save failed");
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSave}
      disabled={state !== "idle"}
    >
      {state === "saving" ? (
        <Loader2 className="animate-spin" />
      ) : state === "saved" ? (
        <Check />
      ) : (
        <Bookmark />
      )}
      {state === "saved" ? "Saved" : label}
    </Button>
  );
}
