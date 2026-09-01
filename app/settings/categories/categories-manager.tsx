"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addCategory, editCategory, setCategoryActive } from "./actions";

interface Cat {
  id: string;
  name: string;
  type: "revenue" | "expense";
  standaloneOnly: boolean;
  active: boolean;
  displayOrder: number;
}

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

function EditRow({ cat, onDone }: { cat: Cat; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(cat.name);
  const [standaloneOnly, setStandaloneOnly] = useState(cat.standaloneOnly);
  const [displayOrder, setDisplayOrder] = useState(String(cat.displayOrder));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setError(null);
    const order = Number(displayOrder);
    if (!Number.isInteger(order)) {
      setError("Display order must be a whole number.");
      return;
    }
    setPending(true);
    const res = await editCategory(cat.id, {
      name,
      type: cat.type,
      standaloneOnly,
      displayOrder: order,
    });
    setPending(false);
    if (res.ok) {
      router.refresh();
      onDone();
    } else {
      setError(res.error);
    }
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="p-2">
        <input
          aria-label="Name"
          className="h-9 rounded border px-2"
          style={fieldStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </td>
      {cat.type === "expense" ? (
        <td className="p-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={standaloneOnly}
              onChange={(e) => setStandaloneOnly(e.target.checked)}
            />
            <span style={{ fontSize: "var(--text-caption)" }}>Standalone only</span>
          </label>
        </td>
      ) : (
        <td className="p-2" />
      )}
      <td className="p-2">
        <input
          aria-label="Display order"
          inputMode="numeric"
          className="h-9 w-16 rounded border px-2"
          style={fieldStyle}
          value={displayOrder}
          onChange={(e) => setDisplayOrder(e.target.value.replace(/[^\d-]/g, ""))}
        />
      </td>
      <td className="p-2" colSpan={2}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={save}
            style={{ color: "var(--brand)", fontWeight: 600 }}
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onDone} style={{ color: "var(--text-muted)" }}>
            Cancel
          </button>
        </div>
        {error ? (
          <p style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</p>
        ) : null}
      </td>
    </tr>
  );
}

function Row({ cat }: { cat: Cat }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  async function toggleActive() {
    setPending(true);
    await setCategoryActive(cat.id, !cat.active);
    setPending(false);
    router.refresh();
  }

  if (editing) {
    return <EditRow cat={cat} onDone={() => setEditing(false)} />;
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="p-2" style={{ opacity: cat.active ? 1 : 0.5 }}>
        {cat.name}
      </td>
      <td className="p-2" style={{ opacity: cat.active ? 1 : 0.5 }}>
        {cat.type === "expense" && cat.standaloneOnly ? (
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Standalone only
          </span>
        ) : null}
      </td>
      <td className="p-2" style={{ opacity: cat.active ? 1 : 0.5 }}>
        {cat.displayOrder}
      </td>
      <td className="p-2">
        {cat.active ? (
          <span style={{ color: "var(--text)" }}>Active</span>
        ) : (
          <span style={{ color: "var(--text-faint)" }}>Inactive</span>
        )}
      </td>
      <td className="p-2 text-right">
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setEditing(true)} style={{ color: "var(--brand)" }}>
            Edit
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={toggleActive}
            style={{ color: "var(--text-muted)" }}
          >
            {cat.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddRow({ type }: { type: "revenue" | "expense" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [standaloneOnly, setStandaloneOnly] = useState(false);
  const [displayOrder, setDisplayOrder] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function add() {
    setError(null);
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    const order = Number(displayOrder);
    if (!Number.isInteger(order)) {
      setError("Display order must be a whole number.");
      return;
    }
    setPending(true);
    const res = await addCategory({
      name: name.trim(),
      type,
      standaloneOnly,
      displayOrder: order,
    });
    setPending(false);
    if (res.ok) {
      setName("");
      setStandaloneOnly(false);
      setDisplayOrder("0");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-card border p-3" style={fieldStyle}>
      <h3 style={{ fontSize: "var(--text-label)", fontWeight: 600 }}>
        Add {type} category
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Name
          </span>
          <input
            aria-label={`New ${type} category name`}
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {type === "expense" ? (
          <label className="flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              checked={standaloneOnly}
              onChange={(e) => setStandaloneOnly(e.target.checked)}
            />
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
              Standalone only (hide from the night report)
            </span>
          </label>
        ) : null}
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Display order
          </span>
          <input
            aria-label={`New ${type} category display order`}
            inputMode="numeric"
            className="h-9 w-16 rounded border px-2"
            style={fieldStyle}
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value.replace(/[^\d-]/g, ""))}
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={add}
          className="h-9 rounded-card px-4 font-medium"
          style={{ background: "var(--brand)", color: "var(--on-brand)", opacity: pending ? 0.7 : 1 }}
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {error ? (
        <p style={{ fontSize: "var(--text-label)", color: "var(--warn)" }}>{error}</p>
      ) : null}
    </div>
  );
}

export default function CategoriesManager({
  type,
  categories,
}: {
  type: "revenue" | "expense";
  categories: Cat[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: "var(--text-label)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">{type === "expense" ? "Scope" : ""}</th>
              <th className="p-2 text-left">Order</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <Row key={c.id} cat={c} />
            ))}
          </tbody>
        </table>
      </div>
      <AddRow type={type} />
    </div>
  );
}
