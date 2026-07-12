import type { Metadata } from "next";

import { NotesClient } from "./notes-client";

export const metadata: Metadata = { title: "Meeting Notes" };

export default function MeetingNotesPage() {
  return <NotesClient />;
}
