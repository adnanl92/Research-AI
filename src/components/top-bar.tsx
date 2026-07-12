"use client";

import { usePathname } from "next/navigation";

import { getToolByRoute } from "@/lib/tools/registry";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/user-menu";

interface TopBarProps {
  userName?: string | null;
  userEmail?: string | null;
}

export function TopBar({ userName, userEmail }: TopBarProps) {
  const pathname = usePathname();
  const tool = getToolByRoute(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <h1 className="text-sm font-medium">
        {tool?.label ?? "WashU Research Assistant"}
      </h1>
      <div className="ml-auto">
        <UserMenu name={userName} email={userEmail} />
      </div>
    </header>
  );
}
