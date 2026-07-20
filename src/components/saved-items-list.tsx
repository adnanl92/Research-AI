"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DownloadButton } from "@/components/download-button";
import { MarkdownView } from "@/components/markdown-view";

export interface SavedItemView {
  id: string;
  title: string;
  toolLabel: string;
  createdAt: string;
}

/**
 * Clickable list of saved items: opens the full saved content in a dialog
 * with download and delete actions. The list itself carries only metadata;
 * the (potentially large) content is fetched when an item is opened.
 */
export function SavedItemsList({ items }: { items: SavedItemView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<SavedItemView | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleOpen(item: SavedItemView) {
    setOpen(item);
    setContent(null);
    try {
      const response = await fetch(`/api/saved-items/${item.id}`);
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Could not load this saved item");
      }
      const data = await response.json();
      setContent(data.item.content);
    } catch (error) {
      setOpen(null);
      toast.error(
        error instanceof Error ? error.message : "Could not load this saved item",
      );
    }
  }

  async function handleDelete(item: SavedItemView) {
    setDeleting(true);
    try {
      const response = await fetch(`/api/saved-items/${item.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Delete failed");
      }
      setOpen(null);
      toast.success("Saved item deleted.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ul className="divide-y rounded-lg border">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => handleOpen(item)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
            >
              <Bookmark className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.toolLabel} · {item.createdAt}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
          {open ? (
            <div className="flex max-h-[calc(85vh-3rem)] flex-col gap-4">
              <DialogHeader className="shrink-0 pr-8">
                <DialogTitle className="leading-snug">{open.title}</DialogTitle>
                <DialogDescription>
                  {open.toolLabel} · saved {open.createdAt}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/30 p-4">
                {content === null ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                  </div>
                ) : (
                  <MarkdownView>{content}</MarkdownView>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {content !== null ? (
                  <DownloadButton
                    content={content}
                    filename={`${open.title.slice(0, 50).replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "saved-item"}.md`}
                  />
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(open)}
                  disabled={deleting}
                  className="text-destructive hover:text-destructive"
                >
                  {deleting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Trash2 />
                  )}
                  Delete
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
