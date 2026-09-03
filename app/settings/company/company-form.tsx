"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyDetails } from "@/lib/companyDetails";
import FormPanel from "@/components/ui/form-panel";
import { saveCompanyDetails } from "./actions";

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export default function CompanyForm({ initial }: { initial: CompanyDetails }) {
  const router = useRouter();
  const [v, setV] = useState<CompanyDetails>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof CompanyDetails>(k: K, val: CompanyDetails[K]) => {
    setV((s) => ({ ...s, [k]: val }));
    setSaved(false);
  };

  const input = (k: keyof CompanyDetails, ariaLabel: string) => (
    <input
      aria-label={ariaLabel}
      value={v[k]}
      onChange={(e) => set(k, e.target.value)}
      className="h-11 rounded border px-3"
      style={fieldStyle}
    />
  );

  async function submit() {
    setError(null);
    setPending(true);
    const res = await saveCompanyDetails(v);
    setPending(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FormPanel title="Identity">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Trading name">{input("tradingName", "Trading name")}</Field>
          <Field label="Legal name">{input("legalName", "Legal name")}</Field>
          <Field label="SSM registration number">{input("ssmNumber", "SSM registration number")}</Field>
        </div>
      </FormPanel>

      <FormPanel title="Contact">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Address" wide>
            <textarea
              aria-label="Address"
              rows={3}
              value={v.address}
              onChange={(e) => set("address", e.target.value)}
              className="rounded-card border p-3"
              style={fieldStyle}
            />
          </Field>
          <Field label="Phone">{input("phone", "Phone")}</Field>
          <Field label="Email">{input("email", "Email")}</Field>
          <Field label="Website">{input("website", "Website")}</Field>
        </div>
      </FormPanel>

      <FormPanel title="Tax registrations">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="TIN (for e-Invoice)">{input("tin", "TIN")}</Field>
          <Field label="SST registration number">{input("sstNumber", "SST registration number")}</Field>
          <Field label="Tourism tax registration number">
            {input("tourismTaxNumber", "Tourism tax registration number")}
          </Field>
        </div>
      </FormPanel>

      <FormPanel title="Logo">
        <Field label="Logo URL (a pasted link, same as photos elsewhere)">
          {input("logoUrl", "Logo URL")}
        </Field>
      </FormPanel>

      <FormPanel title="Bank details (payment instructions)" error={error}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Bank name">{input("bankName", "Bank name")}</Field>
          <Field label="Account name">{input("bankAccountName", "Account name")}</Field>
          <Field label="Account number">{input("bankAccountNumber", "Account number")}</Field>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="btn-primary h-11 self-start rounded-card px-4 font-medium"
            style={{ opacity: pending ? 0.7 : 1 }}
          >
            {pending ? "Saving…" : "Save company details"}
          </button>
          {saved ? (
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
              Saved.
            </span>
          ) : null}
        </div>
      </FormPanel>
    </div>
  );
}
