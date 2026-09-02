"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/badge";
import FormPanel from "@/components/ui/form-panel";
import DataTable from "@/components/ui/data-table";
import {
  addOtaPlatform,
  editOtaPlatform,
  setOtaPlatformActive,
} from "./actions";

interface Platform {
  id: string;
  name: string;
  active: boolean;
  displayOrder: number;
  guestPaysPlatform: boolean;
}

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

function EditRow({
  platform,
  onDone,
}: {
  platform: Platform;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(platform.name);
  const [guestPaysPlatform, setGuestPaysPlatform] = useState(
    platform.guestPaysPlatform,
  );
  const [displayOrder, setDisplayOrder] = useState(String(platform.displayOrder));
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
    const res = await editOtaPlatform(platform.id, {
      name,
      displayOrder: order,
      guestPaysPlatform,
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
      <td className="px-4 py-3">
        <input
          aria-label="Name"
          className="h-9 rounded border px-2"
          style={fieldStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </td>
      <td className="px-4 py-3">
        <label className="flex items-center gap-2">
          <input
            aria-label="Guest pays platform"
            type="checkbox"
            checked={guestPaysPlatform}
            onChange={(e) => setGuestPaysPlatform(e.target.checked)}
          />
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Guest pays platform
          </span>
        </label>
      </td>
      <td className="px-4 py-3">
        <input
          aria-label="Display order"
          inputMode="numeric"
          className="h-9 w-16 rounded border px-2"
          style={fieldStyle}
          value={displayOrder}
          onChange={(e) => setDisplayOrder(e.target.value.replace(/[^\d-]/g, ""))}
        />
      </td>
      <td className="px-4 py-3" colSpan={2}>
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

function Row({ platform }: { platform: Platform }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  async function toggleActive() {
    setPending(true);
    await setOtaPlatformActive(platform.id, !platform.active);
    setPending(false);
    router.refresh();
  }

  if (editing) {
    return <EditRow platform={platform} onDone={() => setEditing(false)} />;
  }

  return (
    <tr className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-4 py-3" style={{ opacity: platform.active ? 1 : 0.5 }}>
        {platform.name}
      </td>
      <td className="px-4 py-3" style={{ opacity: platform.active ? 1 : 0.5 }}>
        {platform.guestPaysPlatform ? "Platform" : "Us"}
      </td>
      <td className="px-4 py-3" style={{ opacity: platform.active ? 1 : 0.5 }}>
        {platform.displayOrder}
      </td>
      <td className="px-4 py-3">
        <Badge tone={platform.active ? "neutral" : "muted"}>
          {platform.active ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right">
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
            {platform.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddRow() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [guestPaysPlatform, setGuestPaysPlatform] = useState(false);
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
    const res = await addOtaPlatform({
      name: name.trim(),
      displayOrder: order,
      guestPaysPlatform,
    });
    setPending(false);
    if (res.ok) {
      setName("");
      setGuestPaysPlatform(false);
      setDisplayOrder("0");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <FormPanel title="Add OTA platform" error={error}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Name
          </span>
          <input
            aria-label="New platform name"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input
            aria-label="New platform: guest pays platform"
            type="checkbox"
            checked={guestPaysPlatform}
            onChange={(e) => setGuestPaysPlatform(e.target.checked)}
          />
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Guest pays platform
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Display order
          </span>
          <input
            aria-label="New platform display order"
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
          className="btn-primary h-9 rounded-card px-4 font-medium"
          style={{ opacity: pending ? 0.7 : 1 }}
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
    </FormPanel>
  );
}

export default function OtaPlatformsManager({ platforms }: { platforms: Platform[] }) {
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={[
          { key: "name", header: "Name" },
          { key: "guestPays", header: "Guest pays" },
          { key: "order", header: "Order" },
          { key: "status", header: "Status" },
          { key: "actions", header: "" },
        ]}
        isEmpty={platforms.length === 0}
        emptyMessage="No OTA platforms yet."
      >
        {platforms.map((p) => (
          <Row key={p.id} platform={p} />
        ))}
      </DataTable>
      <AddRow />
    </div>
  );
}
