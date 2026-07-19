"use client";

import { usePathname } from "next/navigation";

import { getToolByRoute } from "@/lib/tools/registry";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";

interface TopBarProps {
  userName?: string | null;
  userEmail?: string | null;
}

export function TopBar({ userName, userEmail }: TopBarProps) {
  const pathname = usePathname();
  const tool = getToolByRoute(pathname);

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <h1 className="text-sm font-medium">
        {tool?.label ?? "WashU Research Assistant"}
      </h1>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <UserMenu name={userName} email={userEmail} />
      </div>
    </header>
  );
}
