"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DisclaimerBanner } from "@/components/disclaimer-banner";
import { DownloadButton } from "@/components/download-button";
import { MarkdownView } from "@/components/markdown-view";
import { SaveButton } from "@/components/save-button";

const STUDY_TYPES = [
  { value: "observational", label: "Observational" },
  { value: "interventional", label: "Interventional" },
  { value: "retrospective-chart-review", label: "Retrospective chart review" },
  { value: "survey", label: "Survey" },
  { value: "qualitative-interviews", label: "Qualitative interviews" },
  { value: "secondary-data-analysis", label: "Secondary data analysis" },
  { value: "other", label: "Other" },
];

interface FormState {
  title: string;
  studyType: string;
  population: string;
  procedures: string;
  risks: string;
  dataHandling: string;
}

const STEPS: {
  key: keyof FormState;
  title: string;
  hint: string;
  minLength: number;
}[] = [
  {
    key: "title",
    title: "Study Title",
    hint: "The working title of your study.",
    minLength: 5,
  },
  {
    key: "studyType",
    title: "Study Type",
    hint: "Select the design that best matches your study.",
    minLength: 1,
  },
  {
    key: "population",
    title: "Population & Recruitment",
    hint: "Who will participate (inclusion/exclusion criteria, target N) and how they will be identified and recruited.",
    minLength: 10,
  },
  {
    key: "procedures",
    title: "Procedures",
    hint: "What participants (or their records) will undergo: visits, surveys, interventions, data extraction, timelines.",
    minLength: 10,
  },
  {
    key: "risks",
    title: "Risks & Safeguards",
    hint: "Anticipated risks (physical, psychological, privacy) and how each will be minimized or managed.",
    minLength: 10,
  },
  {
    key: "dataHandling",
    title: "Data Handling",
    hint: "Where data will be stored, who has access, identifiability, retention, and de-identification/destruction plans.",
    minLength: 10,
  },
];

export function IrbClient() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    title: "",
    studyType: "",
    population: "",
    procedures: "",
    risks: "",
    dataHandling: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  const current = STEPS[step];
  const value = form[current.key];
  const stepValid = value.trim().length >= current.minLength;
  const isLast = step === STEPS.length - 1;

  function setValue(v: string) {
    setForm((f) => ({ ...f, [current.key]: v }));
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      const response = await fetch("/api/tools/irb-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Generation failed");
      setDraft(data.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h2 className="font-serif text-2xl font-semibold tracking-tight">
          IRB Draft Assistant
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Answer six guided questions to generate a structured first-draft
          protocol document you can edit and export.
        </p>
      </div>

      <DisclaimerBanner>
        AI-assisted draft. Review before submission. This does not replace
        institutional IRB review or legal/compliance guidance, and no part of
        the output constitutes a regulatory determination.
      </DisclaimerBanner>

      {!draft && !loading ? (
        <Card>
          <CardHeader className="space-y-3 pb-4">
            <Progress value={((step + 1) / STEPS.length) * 100} />
            <CardTitle className="text-base">
              Step {step + 1} of {STEPS.length}: {current.title}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{current.hint}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {current.key === "title" ? (
              <div className="space-y-2">
                <Label htmlFor="irb-input">Title</Label>
                <Input
                  id="irb-input"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. Effects of Brief Mindfulness Training on Resident Physician Burnout"
                />
              </div>
            ) : current.key === "studyType" ? (
              <div className="space-y-2">
                <Label htmlFor="irb-type">Study type</Label>
                <Select value={value} onValueChange={setValue}>
                  <SelectTrigger id="irb-type" className="w-full sm:w-80">
                    <SelectValue placeholder="Select a study type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {STUDY_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="irb-area">{current.title}</Label>
                <Textarea
                  id="irb-area"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  rows={7}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
              >
                <ArrowLeft /> Back
              </Button>
              {isLast ? (
                <Button onClick={submit} disabled={!stepValid}>
                  <Sparkles /> Generate draft protocol
                </Button>
              ) : (
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!stepValid}
                >
                  Next <ArrowRight />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Generating the draft protocol… (~30-60s)
          </p>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Generation failed</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" className="w-fit" onClick={submit}>
              <RotateCcw /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {draft ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                Draft protocol (editable)
              </CardTitle>
              <div className="flex gap-2">
                <SaveButton
                  toolId="irb-draft"
                  title={`IRB draft: ${form.title.slice(0, 80)}`}
                  content={draft}
                />
                <DownloadButton
                  content={draft}
                  filename="irb-protocol-draft.md"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={22}
                className="font-mono text-xs"
              />
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                  Preview
                </h4>
                <MarkdownView>{draft}</MarkdownView>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(null);
                  setStep(0);
                }}
              >
                Start over
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
