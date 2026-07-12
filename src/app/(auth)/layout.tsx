import { GraduationCap } from "lucide-react";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 p-4">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap className="size-5" />
        </div>
        <span className="text-lg font-semibold">WashU Research Assistant</span>
      </div>
      {children}
      <p className="mt-6 max-w-sm text-center text-xs text-muted-foreground">
        <strong>No PHI:</strong> This application must not be used to store or
        process protected health information in this configuration.
      </p>
    </div>
  );
}
