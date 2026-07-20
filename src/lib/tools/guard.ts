import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Shared guard for all /api/tools/* routes: authentication + a per-user
 * sliding-window rate limit backed by ToolRun timestamps (no external
 * rate-limit service).
 *
 * The guard reserves the caller's rate-limit slot by inserting the ToolRun
 * row up front and then re-counting, so concurrent requests cannot race
 * past the limit (count-after-insert). The route fills in the summary,
 * token counts, and latency via completeToolRun once the work finishes.
 * A consequence: runs that later fail still consume a slot — intentional,
 * since failed runs still burn CPU and (often) LLM spend.
 */

const MAX_CALLS_PER_HOUR = 30;

export async function requireToolAccess(
  toolId: string,
): Promise<{ userId: string; runId: string } | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = session.user.id;

  const windowStart = new Date(Date.now() - 60 * 60 * 1000);
  const run = await db.toolRun.create({
    data: { userId, toolId, inputSummary: "" },
  });
  const recentCalls = await db.toolRun.count({
    where: { userId, createdAt: { gte: windowStart } },
  });

  if (recentCalls > MAX_CALLS_PER_HOUR) {
    // Over the limit (or lost a race for the last slot): release the
    // reservation and reject.
    await db.toolRun.delete({ where: { id: run.id } }).catch(() => {});
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

  return { userId, runId: run.id };
}
