import { Construction } from "lucide-react";

import { getToolById } from "@/lib/tools/registry";

export function UnderConstruction({ toolId }: { toolId: string }) {
  const tool = getToolById(toolId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Construction className="size-7 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">
          {tool?.label ?? toolId} is under construction
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {tool?.description ?? "This tool is being built."}
        </p>
      </div>
    </div>
  );
}
