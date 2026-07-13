import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { auth } from "@/lib/auth";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <TooltipProvider>
      <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <TopBar
          userName={session?.user?.name}
          userEmail={session?.user?.email}
        />
        <main className="flex-1 p-4 md:p-6">{children}</main>
        <footer className="border-t px-4 py-3 text-center text-xs text-muted-foreground md:px-6">
          <p>
            <strong>No PHI:</strong> This application must not be used to
            store or process protected health information (PHI) in this
            configuration. AI outputs are first drafts. Review everything
            before use.
          </p>
        </footer>
      </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
