import { TriangleAlert } from "lucide-react";

/**
 * Persistent, non-dismissible disclaimer shown on tools that draft
 * grant/IRB/review content. Deliberately has no close button.
 */
export function DisclaimerBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
