"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/badge";
import FormPanel from "@/components/ui/form-panel";
import DataTable from "@/components/ui/data-table";
import { addUser, editUser, setActive, resetPassword } from "./actions";

// Kept local rather than imported from lib/users (a server module that pulls in
// mongodb) so this client bundle stays light. The server re-validates role
// against the real ROLES list on every action.
const ROLE_OPTIONS = ["reception", "manager", "owner"] as const;
type RoleOption = (typeof ROLE_OPTIONS)[number];

const ROLE_LABELS: Record<RoleOption, string> = {
  reception: "Reception",
  manager: "Manager",
  owner: "Owner",
};

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: RoleOption;
  active: boolean;
  lastSignIn: string | null;
}

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

function EditRow({
  user,
  isSelf,
  onDone,
}: {
  user: UserRow;
  isSelf: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<RoleOption>(user.role);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // An owner can't demote their own account — lock the role field on the self
  // row. The store enforces this regardless; this just avoids offering it.
  const roleLocked = isSelf;

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setPending(true);
    const res = await editUser(user.id, { name: name.trim(), role });
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
      <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
        {user.email}
      </td>
      <td className="px-4 py-3">
        <select
          aria-label="Role"
          className="h-9 rounded border px-2"
          style={{ ...fieldStyle, opacity: roleLocked ? 0.5 : 1 }}
          value={role}
          disabled={roleLocked}
          onChange={(e) => setRole(e.target.value as RoleOption)}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3" colSpan={3}>
        <div className="flex items-center gap-3">
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
          {roleLocked ? (
            <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
              You can&apos;t change your own role.
            </span>
          ) : null}
        </div>
        {error ? (
          <p style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</p>
        ) : null}
      </td>
    </tr>
  );
}

function ResetRow({
  user,
  onDone,
}: {
  user: UserRow;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    setPending(true);
    const res = await resetPassword(user.id, password);
    setPending(false);
    if (res.ok) {
      onDone();
    } else {
      setError(res.error);
    }
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-4 py-3">{user.name}</td>
      <td className="px-4 py-3" colSpan={5}>
        <div className="flex flex-wrap items-center gap-3">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            New password for {user.email}:
          </span>
          <input
            aria-label={`New password for ${user.email}`}
            type="password"
            autoComplete="new-password"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            style={{ color: "var(--brand)", fontWeight: 600 }}
          >
            {pending ? "Setting…" : "Set password"}
          </button>
          <button type="button" onClick={onDone} style={{ color: "var(--text-muted)" }}>
            Cancel
          </button>
        </div>
        {error ? (
          <p style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</p>
        ) : (
          <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
            At least 8 characters. Three simple words work well — easier to type than a
            complex password, and stronger. The owner sets it directly and shares it with
            the user.
          </p>
        )}
      </td>
    </tr>
  );
}

function Row({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "reset">("view");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive() {
    setError(null);
    setPending(true);
    const res = await setActive(user.id, !user.active);
    setPending(false);
    if (res.ok) {
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  if (mode === "edit") {
    return <EditRow user={user} isSelf={isSelf} onDone={() => setMode("view")} />;
  }
  if (mode === "reset") {
    return (
      <ResetRow
        user={user}
        onDone={() => {
          setMode("view");
          router.refresh();
        }}
      />
    );
  }

  const dim = { opacity: user.active ? 1 : 0.5 };

  return (
    <tr className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-4 py-3" style={dim}>
        {user.name}
        {isSelf ? (
          <span style={{ color: "var(--text-faint)" }}> (you)</span>
        ) : null}
      </td>
      <td className="px-4 py-3" style={{ ...dim, color: "var(--text-muted)" }}>
        {user.email}
      </td>
      <td className="px-4 py-3" style={dim}>
        {ROLE_LABELS[user.role]}
      </td>
      <td className="px-4 py-3">
        <Badge tone={user.active ? "neutral" : "muted"}>
          {user.active ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-4 py-3" style={{ ...dim, color: "var(--text-muted)" }}>
        {user.lastSignIn ?? "Never"}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end gap-1">
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setMode("edit")} style={{ color: "var(--brand)" }}>
              Edit
            </button>
            <button type="button" onClick={() => setMode("reset")} style={{ color: "var(--brand)" }}>
              Reset password
            </button>
            <button
              type="button"
              disabled={pending || (isSelf && user.active)}
              onClick={toggleActive}
              title={
                isSelf && user.active ? "You can't deactivate your own account." : undefined
              }
              style={{
                color: "var(--text-muted)",
                opacity: isSelf && user.active ? 0.4 : 1,
                cursor: isSelf && user.active ? "not-allowed" : "pointer",
              }}
            >
              {user.active ? "Deactivate" : "Activate"}
            </button>
          </div>
          {error ? (
            <p style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</p>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function AddUserForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleOption>("reception");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function add() {
    setError(null);
    setPending(true);
    const res = await addUser({ name, email, role, password });
    setPending(false);
    if (res.ok) {
      setName("");
      setEmail("");
      setRole("reception");
      setPassword("");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <FormPanel title="Add user" error={error}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Name</span>
          <input
            aria-label="New user name"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Email</span>
          <input
            aria-label="New user email"
            type="email"
            autoComplete="off"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Role</span>
          <select
            aria-label="New user role"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={role}
            onChange={(e) => setRole(e.target.value as RoleOption)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Initial password
          </span>
          <input
            aria-label="New user password"
            type="password"
            autoComplete="new-password"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
      {!error ? (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          Password: at least 8 characters. Three simple words work well — easier to type
          than a complex password, and stronger. Not an obvious one — you set it and share
          it with the user.
        </p>
      ) : null}
    </FormPanel>
  );
}

export default function UsersManager({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={[
          { key: "name", header: "Name" },
          { key: "email", header: "Email" },
          { key: "role", header: "Role" },
          { key: "status", header: "Status" },
          { key: "lastSignIn", header: "Last sign-in" },
          { key: "actions", header: "" },
        ]}
        isEmpty={users.length === 0}
        emptyMessage="No users yet."
      >
        {users.map((u) => (
          <Row key={u.id} user={u} isSelf={u.id === currentUserId} />
        ))}
      </DataTable>
      <AddUserForm />
    </div>
  );
}
