import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { thisMonthRange, rangeLabel } from "@/lib/dateRangePresets";
import { getAccount, ensureAccountsIndexes, ensureAccountsSeeded, getAccountMovementsData } from "@/lib/accountsStore";
import { formatRM } from "@/lib/money";
import PageHeader from "@/components/ui/page-header";
import DataTable from "@/components/ui/data-table";

// Depends on request-time data; never prerender.
export const dynamic = "force-dynamic";

export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser("manager");
  const settings = await getSettings();
  const { id } = await params;
  const sp = await searchParams;

  const today = businessDateFor(new Date(), settings.cutoffHour);
  const defaultRange = thisMonthRange(today);
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : defaultRange.from;
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : defaultRange.to;

  const includePartnerMovement = user.role === "owner";

  await ensureAccountsIndexes();
  await ensureAccountsSeeded(today);

  const account = await getAccount(id);
  if (!account) notFound();

  const { movements } = await getAccountMovementsData(to, { includePartnerMovement });
  const mine = movements
    .filter((m) => m.accountId === id && m.date >= from && m.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={account.name}
        description={`Transactions · ${rangeLabel(from, to)}`}
        action={
          <a href={`/accounts?from=${from}&to=${to}`} style={{ color: "var(--brand)", fontSize: "var(--text-label)" }}>
            ← Back to Accounts
          </a>
        }
        animate
      />

      <DataTable
        animate
        columns={[
          { key: "date", header: "Date" },
          { key: "source", header: "Source" },
          { key: "amount", header: "Amount", align: "right" },
        ]}
        isEmpty={mine.length === 0}
        emptyMessage="No transactions for this account in this period."
      >
        {mine.map((m, i) => (
          <tr key={i} className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
            <td className="px-4 py-3">{m.date}</td>
            <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
              {m.source}
            </td>
            <td className={`px-4 py-3 money text-right ${m.amountSen < 0 ? "money-out" : "money-in"}`}>
              {m.amountSen < 0 ? "−" : "+"}
              {formatRM(Math.abs(m.amountSen))}
            </td>
          </tr>
        ))}
      </DataTable>

      {!includePartnerMovement ? (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          Doesn&apos;t include partner drawings or injections.
        </p>
      ) : null}
    </div>
  );
}
