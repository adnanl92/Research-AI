import type { Metadata } from "next";

import { IrbClient } from "./irb-client";

export const metadata: Metadata = { title: "IRB Draft Assistant" };

export default function IrbDraftPage() {
  return <IrbClient />;
}
