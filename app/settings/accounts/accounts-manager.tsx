"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toSen, fromSen, formatRM, MoneyError } from "@/lib/money";
import { ACCOUNT_TYPES } from "@/lib/accounts";
import Badge from "@/components/ui/badge";
import FormPanel from "@/components/ui/form-panel";
import DataTable from "@/components/ui/data-table";
import { addAccount, editAccount, setAccountActive } from "./actions";

interface AccountRow {
  id: string;
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  openingBalanceSen: number;
  openingDate: string;
  active: boolean;
  displayOrder: number;
}

const TYPE_LABELS: Record<AccountRow["type"], string> = {
  cash: "Cash",
  bank: "Bank",
  ewallet: "E-wallet",
};

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

/** Parses to sen, allowing a leading "-" — unlike a physical float, a bank
 * account can legitimately open overdrawn. Returns null when unparseable. */
function parseBalance(s: string): number | null {
  try {
    return toSen(s);
  } catch (err) {
    if (err instanceof MoneyError) return null;
    throw err;
  }
}

function BalanceInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const invalid = parseBalance(value) === null;
  return (
    <input
      aria-label={ariaLabel}
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0.00"
      className="money h-9 w-28 rounded border px-2"
      style={{ ...fieldStyle, borderColor: invalid ? "var(--warn)" : "var(--border-strong)" }}
    />
  );
}

function EditRow({ account, onDone }: { account: AccountRow; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(account.name);
  const [type, setType] = useState<AccountRow["type"]>(account.type);
  const [openingBalance, setOpeningBalance] = useState(fromSen(account.openingBalanceSen));
  const [openingDate, setOpeningDate] = useState(account.openingDate);
  const [displayOrder, setDisplayOrder] = useState(String(account.displayOrder));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setError(null);
    const balanceSen = parseBalance(openingBalance);
    if (balanceSen === null) {
      setError("Enter a valid opening balance.");
      return;
    }
    const order = Number(displayOrder);
    if (!Number.isInteger(order)) {
      setError("Display order must be a whole number.");
      return;
    }
    if (!openingDate) {
      setError("Enter an opening date.");
      return;
    }
    setPending(true);
    const res = await editAccount(account.id, {
      name,
      type,
      openingBalanceSen: balanceSen,
      openingDate,
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
          onChange={(e) => setType(e.target.value as AccountRow["type"])}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <BalanceInput ariaLabel="Opening balance" value={openingBalance} onChange={setOpeningBalance} />
      </td>
      <td className="px-4 py-3">
        <input
          aria-label="Opening date"
          type="date"
          className="h-9 rounded border px-2"
          style={fieldStyle}
          value={openingDate}
          onChange={(e) => setOpeningDate(e.target.value)}
        />
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

function Row({ account }: { account: AccountRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  async function toggleActive() {
    setPending(true);
    await setAccountActive(account.id, !account.active);
    setPending(false);
    router.refresh();
  }

  if (editing) {
    return <EditRow account={account} onDone={() => setEditing(false)} />;
  }

  const dim = { opacity: account.active ? 1 : 0.5 };

  return (
    <tr className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-4 py-3" style={dim}>
        {account.name}
      </td>
      <td className="px-4 py-3" style={dim}>
        {TYPE_LABELS[account.type]}
      </td>
      <td className="px-4 py-3 money" style={dim}>
        {formatRM(account.openingBalanceSen)}
      </td>
      <td className="px-4 py-3" style={dim}>
        {account.openingDate}
      </td>
      <td className="px-4 py-3" style={dim}>
        {account.displayOrder}
      </td>
      <td className="px-4 py-3">
        <Badge tone={account.active ? "neutral" : "muted"}>
          {account.active ? "Active" : "Inactive"}
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
            {account.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddRow() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountRow["type"]>("cash");
  const [openingBalance, setOpeningBalance] = useState("0.00");
  const [openingDate, setOpeningDate] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function add() {
    setError(null);
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    const balanceSen = parseBalance(openingBalance);
    if (balanceSen === null) {
      setError("Enter a valid opening balance.");
      return;
    }
    if (!openingDate) {
      setError("Enter an opening date.");
      return;
    }
    const order = Number(displayOrder);
    if (!Number.isInteger(order)) {
      setError("Display order must be a whole number.");
      return;
    }
    setPending(true);
    const res = await addAccount({
      name: name.trim(),
      type,
      openingBalanceSen: balanceSen,
      openingDate,
      displayOrder: order,
    });
    setPending(false);
    if (res.ok) {
      setName("");
      setType("cash");
      setOpeningBalance("0.00");
      setOpeningDate("");
      setDisplayOrder("0");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <FormPanel title="Add account" error={error}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Name</span>
          <input
            aria-label="New account name"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Type</span>
          <select
            aria-label="New account type"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={type}
            onChange={(e) => setType(e.target.value as AccountRow["type"])}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Opening balance
          </span>
          <BalanceInput ariaLabel="New account opening balance" value={openingBalance} onChange={setOpeningBalance} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Opening date
          </span>
          <input
            aria-label="New account opening date"
            type="date"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Display order
          </span>
          <input
            aria-label="New account display order"
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

export default function AccountsManager({ accounts }: { accounts: AccountRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={[
          { key: "name", header: "Name" },
          { key: "type", header: "Type" },
          { key: "opening", header: "Opening balance" },
          { key: "openingDate", header: "Opening date" },
          { key: "order", header: "Order" },
          { key: "status", header: "Status" },
          { key: "actions", header: "" },
        ]}
        isEmpty={accounts.length === 0}
        emptyMessage="No accounts yet."
        animate
      >
        {accounts.map((a) => (
          <Row key={a.id} account={a} />
        ))}
      </DataTable>
      <AddRow />
    </div>
  );
}
