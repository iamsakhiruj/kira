import {
  ensureLetterTemplateIndexes,
  listLetterTemplates,
} from "@/lib/letterTemplatesStore";
import { type LetterOptionalField } from "@/lib/bookings";
import PageHeader from "@/components/ui/page-header";
import LetterTemplatesManager from "./letter-templates-manager";

export const dynamic = "force-dynamic";

export default async function LetterTemplatesPage() {
  await ensureLetterTemplateIndexes();
  const templates = await listLetterTemplates();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Letter templates"
        description="Named sets of reservation-letter choices — 'Visa application', 'Company booking', 'Standard'. Picked when generating a letter; the last used becomes the default. Deactivate instead of deleting."
        animate
      />
      <LetterTemplatesManager
        templates={templates.map((t) => ({
          id: t._id.toString(),
          name: String(t.name),
          active: Boolean(t.active),
          show: t.show as Record<LetterOptionalField, boolean>,
          clauseKeys: (t.clauseKeys as string[]) ?? [],
          defaultRemarks: String(t.defaultRemarks ?? ""),
        }))}
      />
    </div>
  );
}
