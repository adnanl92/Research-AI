import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownView } from "@/components/markdown-view";

export const metadata: Metadata = { title: "AI Policies" };

/**
 * Fully static reference page — no LLM or database calls.
 * Every section is placeholder content, clearly marked for replacement with
 * WashU's official policy language before production use. Edit the Markdown
 * strings below directly.
 */

const SECTIONS: { title: string; content: string }[] = [
  {
    title: "Institutional AI Use Guidance",
    content: `**[PLACEHOLDER — replace with WashU's official policy language before production use]**

This section should describe the university's expectations for faculty and staff use of generative AI tools, including:

- Which AI tools are approved for university work, and under what data-classification levels.
- Requirements for human review of AI-generated content before it is used in teaching, research, or administration.
- Attribution and disclosure expectations when AI assistance contributes to scholarly work.
- Prohibited uses (e.g., entering restricted data into unapproved tools, using AI to make consequential decisions about individuals without review).

Until replaced, treat all output from this application as **first-draft assistance requiring human review**.`,
  },
  {
    title: "Data Privacy & PHI Notice",
    content: `**[PLACEHOLDER — replace with WashU's official policy language before production use]**

**This application must not be used to store or process Protected Health Information (PHI) in its current configuration.** It is not configured as a HIPAA-compliant environment and no Business Associate Agreement covers the AI backend.

This section should be replaced with guidance covering:

- The university's data classification levels and which may be entered into this tool (public and internal data only, as a default posture).
- What to do if PHI or other restricted data is accidentally submitted (incident reporting contact and process).
- Retention: what this application stores (account details, saved outputs, usage logs with truncated input summaries) and for how long.
- Contacts for the privacy office and information security office.`,
  },
  {
    title: "Funder-Specific AI Disclosure Requirements (NIH / NSF)",
    content: `**[PLACEHOLDER — replace with current funder policy summaries and WashU's interpretation before production use]**

Federal funders are actively updating their positions on AI-generated content. This section should summarize, with links to the primary sources:

- **NIH** — policies on the use of generative AI in grant applications and in peer review (NIH prohibits reviewers from using AI in peer review; applicants remain fully responsible for the accuracy and integrity of submitted content).
- **NSF** — guidance on disclosure of AI use in proposal preparation and the responsibilities of proposers and reviewers.
- **Journals & publishers** — many require disclosure of AI assistance and prohibit listing AI tools as authors.

**Always verify the current policy on the funder's own site before submitting** — these summaries go stale quickly. The Grant Editor tool in this application shows a persistent reminder for this reason.`,
  },
];

export default function AiPoliciesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">AI Policies</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Institutional guidance on AI use in research. This page is static
          reference content maintained by administrators — it makes no AI or
          database calls.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="destructive">Placeholder content</Badge>
        <p className="text-xs text-muted-foreground">
          Replace every section with WashU&apos;s official policy language
          before production use.
        </p>
      </div>

      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownView>{section.content}</MarkdownView>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
