import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { thisMonthRange, detectPreset } from "@/lib/dateRangePresets";
import {
  ensureCategoriesIndexes,
  ensureCategoriesSeeded,
  getActiveCategories,
  getAllCategories,
} from "@/lib/categoriesStore";
import {
  ensurePaymentMethodsIndexes,
  ensurePaymentMethodsSeeded,
  getPaymentMethods,
} from "@/lib/paymentMethodsStore";
import { ensureRevenueEntriesIndexes, getRevenueEntriesBetween } from "@/lib/revenueEntriesStore";
import { getBusinessDaysBetween } from "@/lib/businessDays";
import { totalRevenueSen } from "@/lib/nightReport";
import { getUserNamesByIds } from "@/lib/users";
import PageHeader from "@/components/ui/page-header";
import RevenueManager from "./revenue-manager";
import ReportsPicker from "@/app/reports/reports-view";

// Depends on request-time data; never prerender.
export const dynamic = "force-dynamic";

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; deleted?: string }>;
}) {
  await requireUser("manager");
  const params = await searchParams;
  const showDeleted = params.deleted === "1";

  const settings = await getSettings();
  const today = businessDateFor(new Date(), settings.cutoffHour);
  const defaultRange = thisMonthRange(today);

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const rangeFrom = params.from && DATE_RE.test(params.from) ? params.from : defaultRange.from;
  const rangeTo =
    params.to && DATE_RE.test(params.to)
      ? params.to
      : params.from && DATE_RE.test(params.from)
      ? params.from
      : defaultRange.to;
  const clampedFrom = rangeFrom <= today ? rangeFrom : today;
  const clampedTo =
    rangeTo >= clampedFrom ? (rangeTo <= today ? rangeTo : today) : clampedFrom;

  await Promise.all([
    ensureCategoriesIndexes(),
    ensureCategoriesSeeded(),
    ensurePaymentMethodsIndexes(),
    ensurePaymentMethodsSeeded(),
    ensureRevenueEntriesIndexes(),
  ]);

  const [activeCategories, allCategories, methods, entriesRaw, businessDays] = await Promise.all([
    getActiveCategories("revenue"),
    getAllCategories("revenue"),
    getPaymentMethods(),
    // Always fetched with deleted included — split below.
    getRevenueEntriesBetween(clampedFrom, clampedTo, true),
    // Front-desk (night report) revenue for the same range — shown as its
    // own line, never blended into the standalone total below (rule: never
    // double count front-desk and standalone revenue).
    getBusinessDaysBetween(clampedFrom, clampedTo),
  ]);
  const activeMethods = methods.filter((m) => m.active);

  const activeEntries = entriesRaw.filter((e) => e.deleted !== true);
  const deletedEntries = showDeleted ? entriesRaw.filter((e) => e.deleted === true) : [];

  const categoryNameById = new Map(allCategories.map((c) => [c._id.toString(), c.name]));
  const methodById = new Map(methods.map((m) => [m._id.toString(), m]));
  const userNameById = await getUserNamesByIds(entriesRaw.map((e) => e.recordedBy));

  const frontDeskRevenueSen = businessDays.reduce((sum, d) => {
    const rooms = (d.rooms as { revenueSen?: number } | undefined) ?? {};
    const revenueLines = (d.revenueLines as { amountSen: number }[] | undefined) ?? [];
    return sum + totalRevenueSen(rooms.revenueSen ?? 0, revenueLines);
  }, 0);

  const preset = detectPreset(clampedFrom, clampedTo, today);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Revenue"
        description="The front desk night report is not the only source of income. Record everything else here — a vendor payment, a hall rental, a corporate transfer landing in the bank, extra room sales taken outside the desk."
        action={
          <ReportsPicker
            initialFrom={clampedFrom}
            initialTo={clampedTo}
            initialPreset={preset}
            today={today}
            basePath="/revenue"
            presets={["this_month", "last_month", "custom"]}
          />
        }
        animate
      />

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/revenue/pdf-export?from=${clampedFrom}&to=${clampedTo}`}
          className="flex items-center rounded-card border px-4"
          style={{
            height: "var(--touch-target)",
            fontSize: "var(--text-label)",
            borderColor: "var(--border-strong)",
            color: "var(--brand)",
          }}
        >
          Download PDF
        </a>
        <a
          href={`/revenue/csv-export?from=${clampedFrom}&to=${clampedTo}`}
          className="flex items-center rounded-card border px-4"
          style={{
            height: "var(--touch-target)",
            fontSize: "var(--text-label)",
            borderColor: "var(--border-strong)",
            color: "var(--brand)",
          }}
        >
          Download CSV
        </a>
      </div>

      <RevenueManager
        currentDate={today}
        rangeFrom={clampedFrom}
        rangeTo={clampedTo}
        showDeleted={showDeleted}
        frontDeskRevenueSen={frontDeskRevenueSen}
        categories={activeCategories.map((c) => ({ id: c._id.toString(), name: c.name }))}
        paymentMethods={activeMethods.map((m) => ({ id: m._id.toString(), name: m.name }))}
        entries={activeEntries.map((e) => ({
          id: e._id.toString(),
          date: e.date,
          categoryId: e.categoryId,
          categoryName: categoryNameById.get(e.categoryId) ?? "Unknown",
          amountSen: e.amountSen,
          paymentMethodId: e.paymentMethodId,
          paymentMethodName: methodById.get(e.paymentMethodId)?.name ?? "Unknown",
          paymentMethodType: methodById.get(e.paymentMethodId)?.type ?? "other",
          receivedFrom: e.receivedFrom,
          reference: e.reference ?? "",
          note: e.note ?? "",
          enteredBy: userNameById.get(e.recordedBy) ?? "Unknown",
          deleted: false,
          deletedReason: "",
        }))}
        deletedEntries={deletedEntries.map((e) => ({
          id: e._id.toString(),
          date: e.date,
          categoryId: e.categoryId,
          categoryName: categoryNameById.get(e.categoryId) ?? "Unknown",
          amountSen: e.amountSen,
          paymentMethodId: e.paymentMethodId,
          paymentMethodName: methodById.get(e.paymentMethodId)?.name ?? "Unknown",
          paymentMethodType: methodById.get(e.paymentMethodId)?.type ?? "other",
          receivedFrom: e.receivedFrom,
          reference: e.reference ?? "",
          note: e.note ?? "",
          enteredBy: userNameById.get(e.recordedBy) ?? "Unknown",
          deleted: true,
          deletedReason: e.deletedReason ?? "",
        }))}
      />
    </div>
  );
}
