import type { Metadata } from "next";

import { SearchClient } from "./search-client";

export const metadata: Metadata = { title: "Literature Search" };

export default function LiteratureSearchPage() {
  return <SearchClient />;
}
