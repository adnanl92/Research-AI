"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap } from "lucide-react";

import { activeTools, roadmapTools } from "@/lib/tools/registry";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <GraduationCap className="size-5" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">
                    WashU Research Assistant
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    AI tools for faculty
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {activeTools.map((tool) => {
                const isActive =
                  tool.route === "/"
                    ? pathname === "/"
                    : pathname.startsWith(tool.route);
                return (
                  <SidebarMenuItem key={tool.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={tool.label}
                      className="data-[active=true]:relative data-[active=true]:font-medium data-[active=true]:before:absolute data-[active=true]:before:top-1.5 data-[active=true]:before:bottom-1.5 data-[active=true]:before:left-0 data-[active=true]:before:w-0.5 data-[active=true]:before:rounded-full data-[active=true]:before:bg-primary"
                    >
                      <Link href={tool.route}>
                        <tool.icon />
                        <span>{tool.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Coming soon</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {roadmapTools.map((tool) => (
                <SidebarMenuItem key={tool.id}>
                  <SidebarMenuButton
                    disabled
                    tooltip={`${tool.label} (coming soon)`}
                    className="cursor-not-allowed opacity-50"
                  >
                    <tool.icon />
                    <span>{tool.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter />
    </Sidebar>
  );
}
