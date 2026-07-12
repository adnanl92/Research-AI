import type { Metadata } from "next";

import { GrantClient } from "./grant-client";

export const metadata: Metadata = { title: "Grant Editor" };

export default function GrantEditorPage() {
  return <GrantClient />;
}
