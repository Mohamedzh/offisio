// Unmatched paths under /[lang] (e.g. /en/nope) render the branded [lang]/not-found
// instead of Next's plain 404. Static routes always win over this catch-all.
import { notFound } from "next/navigation";
import { connection } from "next/server";

export const instant = false;

export default async function Missing() {
  await connection(); // request-time, like the unit page's notFound()
  notFound();
}
