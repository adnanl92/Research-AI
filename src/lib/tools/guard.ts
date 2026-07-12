import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Shared guard for all /api/tools/* routes: authentication + a per-user
 * sliding-window rate limit backed by ToolRun timestamps (no external
 * rate-limit service). Every successful tool call writes a ToolRun row,
 * so counting rows in the last hour IS the usage window.
 */

const MAX_CALLS_PER_HOUR = 30;

export async function requireToolAccess(): Promise<
  { userId: string } | NextResponse
> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = session.user.id;

  const windowStart = new Date(Date.now() - 60 * 60 * 1000);
  const recentCalls = await db.toolRun.count({
    where: { userId, createdAt: { gte: windowStart } },
  });

  if (recentCalls >= MAX_CALLS_PER_HOUR) {
    const oldest = await db.toolRun.findFirst({
      where: { userId, createdAt: { gte: windowStart } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const retryAfterMs = oldest
      ? oldest.createdAt.getTime() + 60 * 60 * 1000 - Date.now()
      : 60 * 60 * 1000;
    const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    return NextResponse.json(
      {
        error: `Rate limit reached (${MAX_CALLS_PER_HOUR} tool calls per hour). Try again in about ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      },
    );
  }

  return { userId };
}
