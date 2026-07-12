import type { Metadata } from "next";

import { CritiqueClient } from "./critique-client";

export const metadata: Metadata = { title: "Critique Assistant" };

export default function CritiquePage() {
  return <CritiqueClient />;
}
