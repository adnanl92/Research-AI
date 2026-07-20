import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Generic saved-output endpoint shared by every tool.
 * POST — save an output. GET — list the user's saved items (optionally by tool).
 */

const createSchema = z.object({
  toolId: z.string().min(1).max(50),
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(500_000),
  sourceMetadata: z.string().max(500_000).optional(), // JSON string (citations etc.)
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const item = await db.savedItem.create({
    data: { userId: session.user.id, ...parsed.data },
  });

  return NextResponse.json({ id: item.id }, { status: 201 });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const toolId = new URL(request.url).searchParams.get("toolId") ?? undefined;
  // List view omits content/sourceMetadata (each up to 500 KB per item) —
  // fetch a single item via GET /api/saved-items/[id] to read it.
  const items = await db.savedItem.findMany({
    where: { userId: session.user.id, ...(toolId ? { toolId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, toolId: true, title: true, createdAt: true },
  });

  return NextResponse.json({ items });
}
