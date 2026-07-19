import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { activeTools, getToolById } from "@/lib/tools/registry";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SavedItemsList } from "@/components/saved-items-list";

export default async function HomePage() {
  const toolTiles = activeTools.filter((t) => t.id !== "home");

  const session = await auth();
  const recentItems = session?.user?.id
    ? await db.savedItem.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    : [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div>
        <h2 className="font-serif text-3xl font-semibold tracking-tight">
          Welcome to the WashU Research Assistant
        </h2>
        <p className="mt-1 text-muted-foreground">
          AI-powered tools for literature search, grant writing, IRB drafting,
          and more. Every cited answer is grounded in live scholarly data.
        </p>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          Tools
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {toolTiles.map((tool) => (
            <Link key={tool.id} href={tool.route} className="group">
              <Card className="h-full shadow-xs transition-all duration-200 group-hover:border-primary/25 group-hover:shadow-md">
                <CardHeader>
                  <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <tool.icon className="size-5" />
                  </div>
                  <CardTitle className="flex items-center gap-1 text-base">
                    {tool.label}
                    <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </CardTitle>
                  <CardDescription>{tool.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          Recent saved items
        </h3>
        {recentItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing saved yet. Outputs you save from any tool will show up
            here.
          </p>
        ) : (
          <SavedItemsList
            items={recentItems.map((item) => ({
              id: item.id,
              title: item.title,
              content: item.content,
              toolLabel: getToolById(item.toolId)?.label ?? item.toolId,
              createdAt: item.createdAt.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
            }))}
          />
        )}
      </section>
    </div>
  );
}
