"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRM } from "@/lib/money";
import { formatBusinessDateLabel } from "@/lib/businessDate";
import { countryName } from "@/lib/countries";
import type { CompanyDetails } from "@/lib/companyDetails";
import {
  POLICY_CLAUSES,
  outstandingSen,
  nightsBetween,
  type BookingStatus,
  type LetterConfig,
  type LetterOptionalField,
} from "@/lib/bookings";
import Card from "@/components/ui/card";
import FormPanel from "@/components/ui/form-panel";
import { saveLetterConfig } from "../../actions";

interface LetterRoomLine {
  roomType: string;
  roomsCount: number;
  ratePerNightSen: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  lineTotalSen: number;
}
interface LetterBooking {
  reference: string;
  guestName: string;
  guestIdNumber: string;
  nationality: string;
  phone: string;
  email: string;
  checkIn: string;
  checkOut: string;
  totalRooms: number;
  roomNights: number;
  rooms: LetterRoomLine[];
  tourismTaxApplicable: boolean;
  tourismTaxPerRoomPerNightSen: number;
  roomRevenueSen: number;
  tourismTaxSen: number;
  grandTotalSen: number;
  status: BookingStatus;
}
interface TemplateView {
  id: string;
  name: string;
  show: Record<LetterOptionalField, boolean>;
  clauseKeys: string[];
  defaultRemarks: string;
}

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

const OPTIONAL_FIELD_LABELS: Record<LetterOptionalField, string> = {
  nationality: "Nationality",
  phone: "Phone",
  email: "Email",
  roomType: "Room type",
  arrivalTime: "Arrival time",
};

/** The print stylesheet: hide everything but the letter, and give the page
 * sensible margins. Scoped by class so it only affects this route. */
const PRINT_CSS = `
@media print {
  body { background: #fff !important; }
  .letter-noprint { display: none !important; }
  .letter-shell { display: block !important; }
  .letter-sheet {
    box-shadow: none !important;
    border: none !important;
    margin: 0 !important;
    max-width: none !important;
    width: 100% !important;
  }
  @page { margin: 18mm; }
}
`;

export default function LetterEditor({
  bookingId,
  company,
  booking,
  paidSen,
  initialConfig,
  templates,
}: {
  bookingId: string;
  company: CompanyDetails;
  booking: LetterBooking;
  paidSen: number;
  initialConfig: LetterConfig;
  templates: TemplateView[];
}) {
  const router = useRouter();
  // Company identity comes entirely from Settings > Company details — nothing
  // here is hardcoded.
  const addressLines = company.address.split("\n").filter((l) => l.trim());
  const contactLine = [company.phone, company.email, company.website]
    .filter((s) => s.trim())
    .join(" · ");
  const hasBank =
    company.bankName.trim() ||
    company.bankAccountName.trim() ||
    company.bankAccountNumber.trim();
  const [config, setConfig] = useState<LetterConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outstanding = outstandingSen(booking.grandTotalSen, [
    // paidSen is already net of refunds; model it as a single "paid" line.
    { amountSen: paidSen, type: "full" },
  ]);

  const includedClauses = useMemo(
    () => POLICY_CLAUSES.filter((c) => config.clauseKeys.includes(c.key)),
    [config.clauseKeys],
  );

  const spanNights = nightsBetween(booking.checkIn, booking.checkOut);
  const roomTypes = booking.rooms.map((l) => l.roomType).filter(Boolean);
  const roomTypeSummary =
    roomTypes.length === 0
      ? ""
      : new Set(roomTypes).size === 1
        ? roomTypes[0]
        : "Multiple room types";
  const taxRateRM = (booking.tourismTaxPerRoomPerNightSen / 100).toFixed(2);

  function setShow(field: LetterOptionalField, on: boolean) {
    setConfig((c) => ({ ...c, show: { ...c.show, [field]: on } }));
    setSaved(false);
  }
  function toggleClause(key: string, on: boolean) {
    setConfig((c) => ({
      ...c,
      clauseKeys: on
        ? [...c.clauseKeys, key]
        : c.clauseKeys.filter((k) => k !== key),
    }));
    setSaved(false);
  }
  function applyTemplate(templateId: string) {
    if (templateId === "") {
      setConfig((c) => ({ ...c, templateId: null }));
      return;
    }
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setConfig((c) => ({
      ...c,
      templateId,
      show: { ...t.show },
      clauseKeys: [...t.clauseKeys],
      remarks: c.remarks.trim() === "" ? t.defaultRemarks : c.remarks,
    }));
    setSaved(false);
  }

  async function saveAndPrint() {
    setError(null);
    setSaving(true);
    // Persist the config so a reprint matches and this becomes the default.
    const res = await saveLetterConfig(bookingId, config);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    router.refresh();
    // Give React a tick to commit, then open the print dialog.
    setTimeout(() => window.print(), 50);
  }

  const show = config.show;

  return (
    <div className="flex flex-col gap-4">
      <style>{PRINT_CSS}</style>

      {/* Controls — hidden when printing. */}
      <div className="letter-noprint flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
              Reservation letter
            </h1>
            <p style={{ color: "var(--text-muted)" }}>
              {booking.reference} · a live view of the booking — payment status
              always reflects what&apos;s recorded now.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={saveAndPrint}
              className="btn-primary h-11 rounded-card px-4 font-medium"
              style={{ opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Saving…" : "Save & print / download PDF"}
            </button>
          </div>
        </div>
        {error ? (
          <p style={{ fontSize: "var(--text-label)", color: "var(--warn)" }}>{error}</p>
        ) : null}
        {saved ? (
          <p style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Saved. Use your browser&apos;s print dialog to save as PDF if it didn&apos;t
            open automatically.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormPanel title="Addressing &amp; remarks">
            {templates.length > 0 ? (
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Template</span>
                <select
                  aria-label="Letter template"
                  value={config.templateId ?? ""}
                  onChange={(e) => applyTemplate(e.target.value)}
                  className="h-11 rounded border px-2"
                  style={fieldStyle}
                >
                  <option value="">— None —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="flex flex-col gap-1">
              <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
                Addressed to (optional — a company or embassy)
              </span>
              <input
                aria-label="Addressed to"
                value={config.addressedTo}
                onChange={(e) => {
                  setConfig((c) => ({ ...c, addressedTo: e.target.value }));
                  setSaved(false);
                }}
                className="h-11 rounded border px-3"
                style={fieldStyle}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
                Purpose / remarks (visa wording, embassy requirements, anything asked for)
              </span>
              <textarea
                aria-label="Remarks"
                rows={4}
                value={config.remarks}
                onChange={(e) => {
                  setConfig((c) => ({ ...c, remarks: e.target.value }));
                  setSaved(false);
                }}
                className="rounded-card border p-3"
                style={fieldStyle}
              />
            </label>
            {show.arrivalTime ? (
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Arrival time</span>
                <input
                  aria-label="Arrival time"
                  value={config.arrivalTime}
                  onChange={(e) => {
                    setConfig((c) => ({ ...c, arrivalTime: e.target.value }));
                    setSaved(false);
                  }}
                  placeholder="e.g. 3:00 PM"
                  className="h-11 rounded border px-3"
                  style={fieldStyle}
                />
              </label>
            ) : null}
          </FormPanel>

          <FormPanel title="Show &amp; include">
            <div className="flex flex-col gap-2">
              <span style={{ fontSize: "var(--text-label)", fontWeight: 600 }}>Optional fields</span>
              {(Object.keys(OPTIONAL_FIELD_LABELS) as LetterOptionalField[]).map((f) => (
                <label key={f} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`Show ${OPTIONAL_FIELD_LABELS[f]}`}
                    checked={show[f]}
                    onChange={(e) => setShow(f, e.target.checked)}
                  />
                  <span style={{ fontSize: "var(--text-label)" }}>{OPTIONAL_FIELD_LABELS[f]}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <span style={{ fontSize: "var(--text-label)", fontWeight: 600 }}>Policy clauses</span>
              {POLICY_CLAUSES.map((c) => (
                <label key={c.key} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    aria-label={`Include clause ${c.key}`}
                    checked={config.clauseKeys.includes(c.key)}
                    onChange={(e) => toggleClause(c.key, e.target.checked)}
                    className="mt-1"
                  />
                  <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
                    {c.text}
                  </span>
                </label>
              ))}
            </div>
          </FormPanel>
        </div>
      </div>

      {/* The letter itself — the only thing that prints. */}
      <div className="letter-shell">
        <Card
          className="letter-sheet mx-auto flex flex-col gap-6 p-8"
          style={{ maxWidth: 820, background: "#fff", color: "#111" }}
        >
          <header className="flex items-start justify-between gap-4" style={{ borderBottom: "2px solid #111", paddingBottom: 16 }}>
            <div className="flex items-start gap-3">
              {company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.logoUrl}
                  alt=""
                  style={{ height: 48, width: "auto", objectFit: "contain" }}
                />
              ) : null}
              <div>
                <div style={{ fontSize: 22, fontWeight: 600 }}>{company.tradingName}</div>
                {company.legalName ? (
                  <div style={{ fontSize: 12, color: "#444" }}>
                    {company.legalName}
                    {company.ssmNumber ? ` (${company.ssmNumber})` : ""}
                  </div>
                ) : null}
                {addressLines.map((l, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#444" }}>{l}</div>
                ))}
                {contactLine ? (
                  <div style={{ fontSize: 12, color: "#444" }}>{contactLine}</div>
                ) : null}
                {company.sstNumber ? (
                  <div style={{ fontSize: 11, color: "#666" }}>SST: {company.sstNumber}</div>
                ) : null}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>BOOKING CONFIRMATION</div>
              <div className="money" style={{ fontSize: 13 }}>{booking.reference}</div>
            </div>
          </header>

          {config.addressedTo ? (
            <div style={{ whiteSpace: "pre-line", fontSize: 13 }}>
              <div style={{ color: "#444" }}>To:</div>
              {config.addressedTo}
            </div>
          ) : null}

          <section className="grid grid-cols-2 gap-6" style={{ fontSize: 13 }}>
            <div className="flex flex-col gap-1">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Guest</div>
              <LetterRow label="Name" value={booking.guestName} />
              <LetterRow label="Passport / IC" value={booking.guestIdNumber} />
              {show.nationality ? (
                <LetterRow
                  label="Nationality"
                  value={booking.nationality ? countryName(booking.nationality) : ""}
                />
              ) : null}
              {show.phone ? <LetterRow label="Phone" value={booking.phone} /> : null}
              {show.email ? <LetterRow label="Email" value={booking.email} /> : null}
            </div>
            <div className="flex flex-col gap-1">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Stay</div>
              <LetterRow label="Check-in" value={formatBusinessDateLabel(booking.checkIn)} />
              <LetterRow label="Check-out" value={formatBusinessDateLabel(booking.checkOut)} />
              <LetterRow label="Nights" value={String(spanNights)} />
              <LetterRow label="Rooms" value={String(booking.totalRooms)} />
              {show.roomType && roomTypeSummary ? (
                <LetterRow label="Room type" value={roomTypeSummary} />
              ) : null}
              {show.arrivalTime ? <LetterRow label="Arrival time" value={config.arrivalTime} /> : null}
            </div>
          </section>

          <section>
            <table className="w-full" style={{ fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #111", textAlign: "left" }}>
                  <th style={{ padding: "6px 4px" }}>Description</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Rooms</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Nights</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Rate</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {/* One row per room line — its quantity and nights (brief). */}
                {booking.rooms.map((l, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={{ padding: "6px 4px" }}>
                      Room charge{l.roomType ? ` — ${l.roomType}` : ""}
                    </td>
                    <td className="money" style={{ padding: "6px 4px", textAlign: "right" }}>{l.roomsCount}</td>
                    <td className="money" style={{ padding: "6px 4px", textAlign: "right" }}>{l.nights}</td>
                    <td className="money" style={{ padding: "6px 4px", textAlign: "right" }}>{formatRM(l.ratePerNightSen)}</td>
                    <td className="money" style={{ padding: "6px 4px", textAlign: "right" }}>{formatRM(l.lineTotalSen)}</td>
                  </tr>
                ))}
                {/* A single tourism tax row for the total room-nights (brief). */}
                {booking.tourismTaxApplicable ? (
                  <tr style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={{ padding: "6px 4px" }} colSpan={2}>
                      Tourism tax — {booking.roomNights} room-nights @ RM {taxRateRM} / room / night
                    </td>
                    <td style={{ padding: "6px 4px" }} />
                    <td style={{ padding: "6px 4px" }} />
                    <td className="money" style={{ padding: "6px 4px", textAlign: "right" }}>{formatRM(booking.tourismTaxSen)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="flex justify-end">
            <div className="flex flex-col gap-1" style={{ minWidth: 260, fontSize: 13 }}>
              <SummaryRow label="Total" value={formatRM(booking.grandTotalSen)} strong />
              <SummaryRow label="Paid" value={formatRM(paidSen)} />
              <SummaryRow label="Outstanding" value={formatRM(outstanding)} strong />
            </div>
          </section>

          {hasBank ? (
            <section style={{ fontSize: 12, color: "#444" }}>
              <div style={{ fontWeight: 600, marginBottom: 2, color: "#111" }}>
                Payment instructions
              </div>
              {company.bankName ? <div>Bank: {company.bankName}</div> : null}
              {company.bankAccountName ? <div>Account name: {company.bankAccountName}</div> : null}
              {company.bankAccountNumber ? <div>Account number: {company.bankAccountNumber}</div> : null}
            </section>
          ) : null}

          {config.remarks ? (
            <section style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Remarks</div>
              <div style={{ whiteSpace: "pre-line" }}>{config.remarks}</div>
            </section>
          ) : null}

          {includedClauses.length > 0 ? (
            <section style={{ fontSize: 11, color: "#444" }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#111" }}>Policies</div>
              <ol style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
                {includedClauses.map((c) => (
                  <li key={c.key} style={{ listStyle: "decimal" }}>{c.text}</li>
                ))}
              </ol>
            </section>
          ) : null}

          <footer style={{ fontSize: 11, color: "#666", borderTop: "1px solid #ddd", paddingTop: 12 }}>
            This confirmation was generated by {company.tradingName}. For enquiries please quote
            reference {booking.reference}.
          </footer>
        </Card>
      </div>
    </div>
  );
}

function LetterRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span style={{ color: "#666" }}>{label}</span>
      <span style={{ textAlign: "right" }}>{value || "—"}</span>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className="flex justify-between"
      style={strong ? { fontWeight: 600, borderTop: "1px solid #111", paddingTop: 4 } : undefined}
    >
      <span>{label}</span>
      <span className="money">{value}</span>
    </div>
  );
}
