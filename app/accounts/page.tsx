import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { thisMonthRange, detectPreset, rangeLabel } from "@/lib/dateRangePresets";
import {
  ensureAccountsIndexes,
  ensureAccountsSeeded,
  getAccountMovementsData,
} from "@/lib/accountsStore";
import { summarizeAccountPeriod, ACCOUNT_TYPES } from "@/lib/accounts";
import { formatRM } from "@/lib/money";
import PageHeader from "@/components/ui/page-header";
import DataTable from "@/components/ui/data-table";
import ReportsPicker from "@/app/reports/reports-view";

// Depends on request-time data across six sources; never prerender.
export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<(typeof ACCOUNT_TYPES)[number], string> = {
  cash: "Cash",
  bank: "Bank",
  ewallet: "E-wallet",
};

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser("manager");
  const settings = await getSettings();
  const params = await searchParams;

  const today = businessDateFor(new Date(), settings.cutoffHour);
  const defaultRange = thisMonthRange(today);

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const rangeFrom =
    params.from && DATE_RE.test(params.from) ? params.from : defaultRange.from;
  const rangeTo =
    params.to && DATE_RE.test(params.to)
      ? params.to
      : params.from && DATE_RE.test(params.from)
      ? params.from
      : defaultRange.to;

  const clampedFrom = rangeFrom <= today ? rangeFrom : today;
  const clampedTo =
    rangeTo >= clampedFrom ? (rangeTo <= today ? rangeTo : today) : clampedFrom;

  const includePartnerMovement = user.role === "owner";

  await ensureAccountsIndexes();
  await ensureAccountsSeeded(today);
  const { accounts, movements, unattributedSen } = await getAccountMovementsData(clampedTo, {
    includePartnerMovement,
  });

  const rows = accounts.map((a) => {
    const summary = summarizeAccountPeriod(
      { id: a._id.toString(), openingBalanceSen: a.openingBalanceSen, openingDate: a.openingDate },
      movements,
      clampedFrom,
      clampedTo,
    );
    return { account: a, summary };
  });

  const preset = detectPreset(clampedFrom, clampedTo, today);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounts"
        description={rangeLabel(clampedFrom, clampedTo)}
        action={
          <ReportsPicker
            initialFrom={clampedFrom}
            initialTo={clampedTo}
            initialPreset={preset}
            today={today}
            basePath="/accounts"
          />
        }
        animate
      />

      {unattributedSen > 0 ? (
        <p
          className="rounded-card px-3 py-2"
          style={{ background: "var(--warn-bg)", color: "var(--warn)", fontSize: "var(--text-label)" }}
        >
          {formatRM(unattributedSen)} in this history couldn&apos;t be attributed to an
          account — a payment method with no account linked yet. Check Settings &gt;
          Payment methods.
        </p>
      ) : null}

      <DataTable
        animate
        delayMs={40}
        columns={[
          { key: "name", header: "Account" },
          { key: "opening", header: "Opening", align: "right" },
          { key: "in", header: "Money in", align: "right" },
          { key: "out", header: "Money out", align: "right" },
          { key: "closing", header: "Closing", align: "right" },
        ]}
        isEmpty={rows.length === 0}
        emptyMessage="No accounts yet — add one at Settings > Accounts."
      >
        {rows.map(({ account, summary }) => (
          <tr
            key={account._id.toString()}
            className="table-row-hover"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <td className="px-4 py-3">
              <a href={`/accounts/${account._id.toString()}?from=${clampedFrom}&to=${clampedTo}`} style={{ color: "var(--brand)" }}>
                {account.name}
              </a>
              <span style={{ color: "var(--text-faint)", fontSize: "var(--text-caption)" }}>
                {" "}
                · {TYPE_LABELS[account.type]}
              </span>
            </td>
            <td className="px-4 py-3 money text-right">{formatRM(summary.openingSen)}</td>
            <td className="px-4 py-3 money money-in text-right">{formatRM(summary.moneyInSen)}</td>
            <td className="px-4 py-3 money money-out text-right">
              {summary.moneyOutSen > 0 ? "−" : ""}
              {formatRM(summary.moneyOutSen)}
            </td>
            <td
              className={`px-4 py-3 money text-right ${summary.closingSen < 0 ? "money-out" : ""}`}
              style={{ fontWeight: 600 }}
            >
              {summary.closingSen < 0 ? "−" : ""}
              {formatRM(Math.abs(summary.closingSen))}
            </td>
          </tr>
        ))}
      </DataTable>

      {!includePartnerMovement ? (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          Figures above don&apos;t include partner drawings or injections.
        </p>
      ) : null}
    </div>
  );
}
