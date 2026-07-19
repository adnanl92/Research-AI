"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  Loader2,
  RotateCcw,
  Workflow,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DownloadButton } from "@/components/download-button";
import { SaveButton } from "@/components/save-button";

const DIAGRAM_TYPES = [
  { value: "auto", label: "Auto (let the model pick)" },
  { value: "flowchart", label: "Flowchart" },
  { value: "sequence", label: "Sequence diagram" },
  { value: "state", label: "State diagram" },
];

export function DiagramClient() {
  const [description, setDescription] = useState("");
  const [diagramType, setDiagramType] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const renderCounter = useRef(0);

  const renderMermaid = useCallback(async (mermaidCode: string) => {
    setRenderError(null);
    setSvg(null);
    try {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
      const id = `diagram-${++renderCounter.current}`;
      const { svg: rendered } = await mermaid.render(id, mermaidCode);
      setSvg(rendered);
    } catch (err) {
      setRenderError(
        err instanceof Error
          ? `Mermaid could not render this code: ${err.message}`
          : "Mermaid could not render this code.",
      );
    }
  }, []);

  useEffect(() => {
    if (code) void renderMermaid(code);
  }, [code, renderMermaid]);

  async function generate() {
    setLoading(true);
    setError(null);
    setCode(null);
    setSvg(null);
    try {
      const response = await fetch("/api/tools/diagram-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, diagramType }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Generation failed");
      setCode(data.mermaid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Diagram Builder</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe a process, workflow, or study design in plain language and
          get an editable Mermaid diagram, rendered right here with no
          external services.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="diagram-type">Diagram type</Label>
          <Select value={diagramType} onValueChange={setDiagramType}>
            <SelectTrigger id="diagram-type" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIAGRAM_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder="e.g. Participants are screened for eligibility, then randomized to intervention or control. The intervention group completes 8 weekly sessions with a mid-point check-in; both groups complete surveys at baseline, week 8, and 6-month follow-up…"
          />
        </div>

        <Button onClick={generate} disabled={loading || description.trim().length < 15}>
          {loading ? <Loader2 className="animate-spin" /> : <Workflow />}
          Generate diagram
        </Button>
      </div>

      {loading ? <Skeleton className="h-64 w-full" /> : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Generation failed</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" className="w-fit" onClick={generate}>
              <RotateCcw /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {code ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Diagram</CardTitle>
              <div className="flex gap-2">
                <SaveButton
                  toolId="diagram-builder"
                  title={`Diagram: ${description.slice(0, 70)}`}
                  content={code}
                />
                <DownloadButton content={code} filename="diagram.mmd" label="Download .mmd" />
              </div>
            </CardHeader>
            <CardContent>
              {renderError ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Render error</AlertTitle>
                  <AlertDescription>
                    {renderError}. Hand-edit the code below and re-render.
                  </AlertDescription>
                </Alert>
              ) : svg ? (
                <div
                  className="overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ) : (
                <Skeleton className="h-48 w-full" />
              )}
            </CardContent>
          </Card>

          <Collapsible defaultOpen={Boolean(renderError)}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ChevronDown className="size-4" />
                Mermaid code (hand-editable)
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              <Textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
              <Button variant="outline" size="sm" onClick={() => renderMermaid(code)}>
                <RotateCcw /> Re-render
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : null}
    </div>
  );
}
