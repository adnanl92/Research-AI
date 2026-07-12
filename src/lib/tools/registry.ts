/**
 * Tool registry — the single source of truth for every tool in the app.
 *
 * The sidebar, home dashboard, and top bar all render from this list.
 * To add a new tool later (podcast summaries, team workspaces, etc.):
 *   1. Change its status from "roadmap" to "active" (or add a new entry).
 *   2. Create its page at the `route` path and, if it calls the LLM,
 *      an API route under /api/tools/<id>.
 * Nothing else needs to change — no layout or navigation edits required.
 */
import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  BarChart3,
  BookOpenCheck,
  Briefcase,
  FileSignature,
  Home,
  Lightbulb,
  MessageSquareQuote,
  NotebookPen,
  Podcast,
  Scale,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";

export type ToolStatus = "active" | "roadmap";

export interface ToolDefinition {
  id: string;
  label: string;
  icon: LucideIcon;
  route: string;
  description: string;
  status: ToolStatus;
}

export const tools: ToolDefinition[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    route: "/",
    description: "Dashboard with all tools and your recent saved items.",
    status: "active",
  },
  {
    id: "literature-search",
    label: "Literature Search",
    icon: BookOpenCheck,
    route: "/tools/literature-search",
    description:
      "Ask a research question and get a grounded, cited answer from live scholarly databases (OpenAlex, Semantic Scholar, PubMed).",
    status: "active",
  },
  {
    id: "grant-editor",
    label: "Grant Editor",
    icon: FileSignature,
    route: "/tools/grant-editor",
    description:
      "Draft a Specific Aims page from a rough idea, and map how your proposal fits into the existing literature.",
    status: "active",
  },
  {
    id: "irb-draft",
    label: "IRB Draft Assistant",
    icon: ShieldCheck,
    route: "/tools/irb-draft",
    description:
      "Guided form that produces a structured first-draft IRB protocol document for you to revise.",
    status: "active",
  },
  {
    id: "critique",
    label: "Critique Assistant",
    icon: MessageSquareQuote,
    route: "/tools/critique",
    description:
      "Constructive pre-submission review: a simulated skeptical reviewer critiques your draft with severity-tagged concerns and fixes.",
    status: "active",
  },
  {
    id: "bibliometric",
    label: "Bibliometric Snapshot",
    icon: BarChart3,
    route: "/tools/bibliometric",
    description:
      "Citation counts, h-index, publication timeline, and top venues for an author or paper, from OpenAlex.",
    status: "active",
  },
  {
    id: "meeting-notes",
    label: "Meeting Notes",
    icon: NotebookPen,
    route: "/tools/meeting-notes",
    description:
      "Paste raw meeting notes and get a structured summary: decisions, action items, and open questions.",
    status: "active",
  },
  {
    id: "diagram-builder",
    label: "Diagram Builder",
    icon: Workflow,
    route: "/tools/diagram-builder",
    description:
      "Describe a process or study design in plain language and get an editable Mermaid diagram.",
    status: "active",
  },
  {
    id: "ai-policies",
    label: "AI Policies",
    icon: Scale,
    route: "/tools/ai-policies",
    description:
      "Institutional AI use guidance, data privacy notices, and funder AI disclosure requirements.",
    status: "active",
  },
  // ---- Roadmap: documented extension points, not built in v1 ----
  {
    id: "podcast-summaries",
    label: "Podcast Summaries",
    icon: Podcast,
    route: "/tools/podcast-summaries",
    description: "Audio summaries of papers and topics.",
    status: "roadmap",
  },
  {
    id: "team-workspaces",
    label: "Team Workspaces",
    icon: Users,
    route: "/tools/team-workspaces",
    description: "Shared projects and collaboration for lab groups.",
    status: "roadmap",
  },
  {
    id: "promotion-packets",
    label: "Promotion & Tenure Packets",
    icon: Briefcase,
    route: "/tools/promotion-packets",
    description: "Assemble promotion and tenure documentation.",
    status: "roadmap",
  },
  {
    id: "invention-disclosure",
    label: "Invention Disclosure Assistant",
    icon: Lightbulb,
    route: "/tools/invention-disclosure",
    description: "Guided drafting for invention disclosures.",
    status: "roadmap",
  },
  {
    id: "accessibility-checker",
    label: "Accessibility Checker",
    icon: Accessibility,
    route: "/tools/accessibility-checker",
    description: "Check course and research materials for accessibility.",
    status: "roadmap",
  },
];

export const activeTools = tools.filter((t) => t.status === "active");
export const roadmapTools = tools.filter((t) => t.status === "roadmap");

export function getToolByRoute(pathname: string): ToolDefinition | undefined {
  if (pathname === "/") return tools.find((t) => t.id === "home");
  return tools.find((t) => t.route !== "/" && pathname.startsWith(t.route));
}

export function getToolById(id: string): ToolDefinition | undefined {
  return tools.find((t) => t.id === id);
}
