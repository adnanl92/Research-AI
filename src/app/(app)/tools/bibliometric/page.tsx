import type { Metadata } from "next";

import { BibliometricClient } from "./bibliometric-client";

export const metadata: Metadata = { title: "Bibliometric Snapshot" };

export default function BibliometricPage() {
  return <BibliometricClient />;
}
