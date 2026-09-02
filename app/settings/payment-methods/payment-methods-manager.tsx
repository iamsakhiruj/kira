"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_METHOD_TYPES } from "@/lib/paymentMethods";
import Badge from "@/components/ui/badge";
import FormPanel from "@/components/ui/form-panel";
import DataTable from "@/components/ui/data-table";
import {
  addPaymentMethod,
  editPaymentMethod,
  setPaymentMethodActive,
  setPaymentMethodAccount,
} from "./actions";

interface Method {
  id: string;
  name: string;
  type: (typeof PAYMENT_METHOD_TYPES)[number];
  active: boolean;
  displayOrder: number;
  accountId: string | null;
}

interface AccountOption {
  id: string;
  name: string;
  active: boolean;
}

const TYPE_LABELS: Record<Method["type"], string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  ewallet: "E-wallet",
  cheque: "Cheque",
  other: "Other",
};

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

/** One-click account link, same pattern as the active toggle — not folded
 * into the main edit form since re-linking is a distinct, lower-stakes
 * action from renaming/retyping a method. */
function AccountPicker({ method, accounts }: { method: Method; accounts: AccountOption[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function change(accountId: string) {
    setPending(true);
    await setPaymentMethodAccount(method.id, accountId || null);
    setPending(false);
    router.refresh();
  }

  return (
    <select
      aria-label={`Account for ${method.name}`}
      className="h-9 rounded border px-2"
      style={fieldStyle}
      value={method.accountId ?? ""}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
    >
      <option value="">Unlinked</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.active ? "" : " (inactive)"}
        </option>
      ))}
    </select>
  );
}

function EditRow({
  method,
  onDone,
}: {
  method: Method;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(method.name);
  const [type, setType] = useState<Method["type"]>(method.type);
  const [displayOrder, setDisplayOrder] = useState(String(method.displayOrder));
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
    const res = await editPaymentMethod(method.id, { name, type, displayOrder: order });
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
        <select
          aria-label="Type"
          className="h-9 rounded border px-2"
          style={fieldStyle}
          value={type}
          onChange={(e) => setType(e.target.value as Method["type"])}
        >
          {PAYMENT_METHOD_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </td>
      {/* Account column stays out of the edit form — re-linking is the
          separate AccountPicker in view mode, not part of this save. */}
      <td className="px-4 py-3" style={{ color: "var(--text-faint)" }}>
        —
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

function Row({ method, accounts }: { method: Method; accounts: AccountOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  async function toggleActive() {
    setPending(true);
    await setPaymentMethodActive(method.id, !method.active);
    setPending(false);
    router.refresh();
  }

  if (editing) {
    return <EditRow method={method} onDone={() => setEditing(false)} />;
  }

  return (
    <tr className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-4 py-3" style={{ opacity: method.active ? 1 : 0.5 }}>
        {method.name}
      </td>
      <td className="px-4 py-3" style={{ opacity: method.active ? 1 : 0.5 }}>
        {TYPE_LABELS[method.type]}
      </td>
      <td className="px-4 py-3">
        <AccountPicker method={method} accounts={accounts} />
      </td>
      <td className="px-4 py-3" style={{ opacity: method.active ? 1 : 0.5 }}>
        {method.displayOrder}
      </td>
      <td className="px-4 py-3">
        <Badge tone={method.active ? "neutral" : "muted"}>
          {method.active ? "Active" : "Inactive"}
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
            {method.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddRow() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<Method["type"]>("cash");
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
    const res = await addPaymentMethod({ name: name.trim(), type, displayOrder: order });
    setPending(false);
    if (res.ok) {
      setName("");
      setType("cash");
      setDisplayOrder("0");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <FormPanel title="Add payment method" error={error} animate delayMs={40}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Name
          </span>
          <input
            aria-label="New method name"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Type
          </span>
          <select
            aria-label="New method type"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={type}
            onChange={(e) => setType(e.target.value as Method["type"])}
          >
            {PAYMENT_METHOD_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Display order
          </span>
          <input
            aria-label="New method display order"
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

export default function PaymentMethodsManager({
  methods,
  accounts,
}: {
  methods: Method[];
  accounts: AccountOption[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={[
          { key: "name", header: "Name" },
          { key: "type", header: "Type" },
          { key: "account", header: "Account" },
          { key: "order", header: "Order" },
          { key: "status", header: "Status" },
          { key: "actions", header: "" },
        ]}
        isEmpty={methods.length === 0}
        emptyMessage="No payment methods yet."
        animate
      >
        {methods.map((m) => (
          <Row key={m.id} method={m} accounts={accounts} />
        ))}
      </DataTable>
      <AddRow />
    </div>
  );
}
