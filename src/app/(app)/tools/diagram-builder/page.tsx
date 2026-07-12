import type { Metadata } from "next";

import { DiagramClient } from "./diagram-client";

export const metadata: Metadata = { title: "Diagram Builder" };

export default function DiagramBuilderPage() {
  return <DiagramClient />;
}
