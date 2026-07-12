"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Download text content as a Markdown (or plain text) file, client-side. */
export function DownloadButton({
  content,
  filename,
  label = "Download .md",
}: {
  content: string;
  filename: string;
  label?: string;
}) {
  function handleDownload() {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDownload}>
      <Download /> {label}
    </Button>
  );
}
