import type { Metadata } from "next";

import { CoachClient } from "./coach-client";

export const metadata: Metadata = { title: "Manuscript Coach" };

export default function ManuscriptCoachPage() {
  return <CoachClient />;
}
