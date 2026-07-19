"use client";

import { useState } from "react";
import { AlertCircle, Loader2, MessageSquareQuote, RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { SaveButton } from "@/components/save-button";

const PERSONAS = [
  { value: "grant-reviewer", label: "Skeptical Grant Reviewer" },
  { value: "irb-member", label: "IRB Board Member" },
  { value: "peer-reviewer", label: "Journal Peer Reviewer" },
];

interface Critique {
  overallImpression: string;
  concerns: { severity: "major" | "minor"; concern: string; suggestedFix: string }[];
}

export function CritiqueClient() {
  const [text, setText] = useState("");
  const [persona, setPersona] = useState("grant-reviewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [critique, setCritique] = useState<Critique | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setCritique(null);
    try {
      const response = await fetch("/api/tools/critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, persona }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Critique failed");
      setCritique(data.critique);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Critique failed");
    } finally {
      setLoading(false);
    }
  }

  const personaLabel = PERSONAS.find((p) => p.value === persona)?.label;

  function critiqueAsText(c: Critique): string {
    return [
      `# Critique (${personaLabel})`,
      "",
      c.overallImpression,
      "",
      ...c.concerns.map(
        (con, i) =>
          `${i + 1}. [${con.severity.toUpperCase()}] ${con.concern}\n   Fix: ${con.suggestedFix}`,
      ),
    ].join("\n");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h2 className="font-serif text-2xl font-semibold tracking-tight">
          Critique Assistant
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Constructive pre-submission review: a simulated reviewer reads your
          draft and returns numbered concerns with severity tags and suggested
          fixes. Nothing is sent anywhere except the AI backend, and nothing
          is judged but the text.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="persona">Reviewer persona</Label>
          <Select value={persona} onValueChange={setPersona}>
            <SelectTrigger id="persona" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERSONAS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="draft">Draft text</Label>
          <Textarea
            id="draft"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="Paste a grant excerpt, IRB section, abstract, or any draft (at least a paragraph)…"
          />
        </div>

        <Button onClick={run} disabled={loading || text.trim().length < 100}>
          {loading ? <Loader2 className="animate-spin" /> : <MessageSquareQuote />}
          Get critique
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The {personaLabel} is reading your draft… (~20-40s)
          </p>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Critique failed</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" className="w-fit" onClick={run}>
              <RotateCcw /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {critique ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                Overall impression: {personaLabel}
              </CardTitle>
              <SaveButton
                toolId="critique"
                title={`Critique (${personaLabel}): ${text.slice(0, 60)}`}
                content={critiqueAsText(critique)}
              />
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{critique.overallImpression}</p>
            </CardContent>
          </Card>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Concerns ({critique.concerns.length})
            </h3>
            {critique.concerns.map((concern, index) => (
              <Card key={index}>
                <CardContent className="space-y-2 pt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">#{index + 1}</span>
                    <Badge
                      variant={concern.severity === "major" ? "destructive" : "secondary"}
                    >
                      {concern.severity === "major" ? "Major" : "Minor"}
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed">{concern.concern}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Suggested fix:
                    </span>{" "}
                    {concern.suggestedFix}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
        </div>
      ) : null}
    </div>
  );
}
