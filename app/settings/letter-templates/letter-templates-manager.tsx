"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  POLICY_CLAUSES,
  LETTER_OPTIONAL_FIELDS,
  type LetterOptionalField,
} from "@/lib/bookings";
import Card from "@/components/ui/card";
import FormPanel from "@/components/ui/form-panel";
import Badge from "@/components/ui/badge";
import {
  addLetterTemplate,
  editLetterTemplate,
  setLetterTemplateActive,
} from "./actions";

interface Template {
  id: string;
  name: string;
  active: boolean;
  show: Record<LetterOptionalField, boolean>;
  clauseKeys: string[];
  defaultRemarks: string;
}

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

const FIELD_LABELS: Record<LetterOptionalField, string> = {
  nationality: "Nationality",
  phone: "Phone",
  email: "Email",
  roomType: "Room type",
  arrivalTime: "Arrival time",
};

function emptyShow(): Record<LetterOptionalField, boolean> {
  return {
    nationality: true,
    phone: true,
    email: true,
    roomType: true,
    arrivalTime: false,
  };
}

function TemplateEditor({
  initial,
  onSubmit,
  submitLabel,
  onCancel,
}: {
  initial: Omit<Template, "id" | "active">;
  onSubmit: (input: {
    name: string;
    show: Record<LetterOptionalField, boolean>;
    clauseKeys: string[];
    defaultRemarks: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [show, setShow] = useState(initial.show);
  const [clauseKeys, setClauseKeys] = useState<string[]>(initial.clauseKeys);
  const [defaultRemarks, setDefaultRemarks] = useState(initial.defaultRemarks);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    if (!name.trim()) return setError("Enter a name.");
    setPending(true);
    const res = await onSubmit({ name: name.trim(), show, clauseKeys, defaultRemarks });
    setPending(false);
    if (res.ok) {
      router.refresh();
      onCancel?.();
    } else {
      setError(res.error);
    }
  }

  return (
    <FormPanel title={onCancel ? undefined : "New template"} error={error}>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Name</span>
        <input
          aria-label="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11 rounded border px-3"
          style={fieldStyle}
        />
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span style={{ fontSize: "var(--text-label)", fontWeight: 600 }}>Optional fields shown</span>
          {LETTER_OPTIONAL_FIELDS.map((f) => (
            <label key={f} className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={`Show ${FIELD_LABELS[f]}`}
                checked={show[f]}
                onChange={(e) => setShow((s) => ({ ...s, [f]: e.target.checked }))}
              />
              <span style={{ fontSize: "var(--text-label)" }}>{FIELD_LABELS[f]}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span style={{ fontSize: "var(--text-label)", fontWeight: 600 }}>Policy clauses included</span>
          {POLICY_CLAUSES.map((c) => (
            <label key={c.key} className="flex items-start gap-2">
              <input
                type="checkbox"
                aria-label={`Include ${c.key}`}
                checked={clauseKeys.includes(c.key)}
                onChange={(e) =>
                  setClauseKeys((keys) =>
                    e.target.checked
                      ? [...keys, c.key]
                      : keys.filter((k) => k !== c.key),
                  )
                }
                className="mt-1"
              />
              <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>{c.text}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Default remarks</span>
        <textarea
          aria-label="Default remarks"
          rows={3}
          value={defaultRemarks}
          onChange={(e) => setDefaultRemarks(e.target.value)}
          className="rounded-card border p-3"
          style={fieldStyle}
        />
      </label>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="btn-primary h-11 self-start rounded-card px-4 font-medium"
          style={{ opacity: pending ? 0.7 : 1 }}
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-card border px-4"
            style={{ borderColor: "var(--border-strong)", color: "var(--text-muted)" }}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </FormPanel>
  );
}

function TemplateCard({ template }: { template: Template }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  if (editing) {
    return (
      <TemplateEditor
        initial={template}
        submitLabel="Save changes"
        onCancel={() => setEditing(false)}
        onSubmit={(input) => editLetterTemplate(template.id, input)}
      />
    );
  }

  const shownFields = LETTER_OPTIONAL_FIELDS.filter((f) => template.show[f]);

  return (
    <Card className="flex flex-col gap-2 p-4" style={{ opacity: template.active ? 1 : 0.6 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ fontWeight: 600 }}>{template.name}</span>
          {!template.active ? <Badge tone="muted">Inactive</Badge> : null}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setEditing(true)} style={{ color: "var(--brand)" }}>
            Edit
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              await setLetterTemplateActive(template.id, !template.active);
              setPending(false);
              router.refresh();
            }}
            style={{ color: "var(--text-muted)" }}
          >
            {template.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>
      <p style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
        Shows: {shownFields.length ? shownFields.map((f) => FIELD_LABELS[f]).join(", ") : "core fields only"}
        {" · "}
        {template.clauseKeys.length} clause{template.clauseKeys.length === 1 ? "" : "s"}
      </p>
    </Card>
  );
}

export default function LetterTemplatesManager({
  templates,
}: {
  templates: Template[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {templates.map((t) => (
        <TemplateCard key={t.id} template={t} />
      ))}
      <TemplateEditor
        initial={{
          name: "",
          show: emptyShow(),
          clauseKeys: POLICY_CLAUSES.map((c) => c.key),
          defaultRemarks: "",
        }}
        submitLabel="Add template"
        onSubmit={(input) => addLetterTemplate(input)}
      />
    </div>
  );
}
