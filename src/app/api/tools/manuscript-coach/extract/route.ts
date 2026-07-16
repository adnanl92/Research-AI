import { NextResponse } from "next/server";

import { requireToolAccess } from "@/lib/tools/guard";

export const maxDuration = 60;

/**
 * Extracts plain text from an uploaded PDF or Word (.docx) manuscript.
 *
 * Privacy design: the file is parsed entirely in memory and is never
 * written to disk, blob storage, or the database. Only the extracted
 * text is returned to the browser, where it lives in client state until
 * the user runs an analysis.
 */

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
// ~80k chars ≈ 20k tokens — comfortably fits every supported backend
// alongside the analysis instructions.
const MAX_TEXT_CHARS = 80_000;
const MIN_TEXT_CHARS = 500;

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(buffer),
  });
  return result.value;
}

export async function POST(request: Request) {
  const access = await requireToolAccess();
  if (access instanceof NextResponse) return access;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "File is larger than 15 MB. Export a smaller version and try again." },
      { status: 413 },
    );
  }

  const name = file.name.toLowerCase();
  const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";
  const isDocx =
    name.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (!isPdf && !isDocx) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload a .pdf or .docx manuscript." },
      { status: 415 },
    );
  }

  try {
    const buffer = await file.arrayBuffer();
    const raw = isPdf ? await extractPdf(buffer) : await extractDocx(buffer);
    const text = normalizeWhitespace(raw);

    if (text.length < MIN_TEXT_CHARS) {
      return NextResponse.json(
        {
          error:
            "Very little text could be extracted from this file. If it is a scanned PDF (images of pages), export a text-based PDF or a .docx instead.",
        },
        { status: 422 },
      );
    }

    const truncated = text.length > MAX_TEXT_CHARS;
    const finalText = truncated ? text.slice(0, MAX_TEXT_CHARS) : text;

    return NextResponse.json({
      text: finalText,
      characterCount: finalText.length,
      wordCount: finalText.split(/\s+/).filter(Boolean).length,
      truncated,
      fileName: file.name,
    });
  } catch (error) {
    console.error("manuscript-coach extract error:", error);
    return NextResponse.json(
      {
        error:
          "Could not read this file. Make sure it is a valid, unencrypted .pdf or .docx and try again.",
      },
      { status: 422 },
    );
  }
}
