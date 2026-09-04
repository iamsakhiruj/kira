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
import { ensureExpensesIndexes, getExpensesBetween } from "@/lib/expensesStore";
import { listPartners } from "@/lib/partnersStore";
import { getUserNamesByIds } from "@/lib/users";
import PageHeader from "@/components/ui/page-header";
import ExpensesManager from "./expenses-manager";
import ReportsPicker from "@/app/reports/reports-view";

// Depends on request-time data; never prerender.
export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; deleted?: string }>;
}) {
  const user = await requireUser("manager");
  const isOwner = user.role === "owner";
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
    ensureExpensesIndexes(),
  ]);

  const [activeCategories, allCategories, methods, expensesRaw, partners] = await Promise.all([
    getActiveCategories("expense"),
    getAllCategories("expense"),
    getPaymentMethods(),
    // Always fetched with deleted included — split below — so "show deleted"
    // needs no second query, and deleted entries still stay out of every
    // total/summary/list unless explicitly requested.
    getExpensesBetween(clampedFrom, clampedTo, true),
    isOwner ? listPartners() : Promise.resolve([]),
  ]);
  const activeMethods = methods.filter((m) => m.active);
  const activePartners = partners.filter((p) => p.active);

  const activeExpenses = expensesRaw.filter((e) => e.deleted !== true);
  const deletedExpenses = showDeleted ? expensesRaw.filter((e) => e.deleted === true) : [];

  const categoryNameById = new Map(allCategories.map((c) => [c._id.toString(), c.name]));
  const methodById = new Map(methods.map((m) => [m._id.toString(), m]));
  const userNameById = await getUserNamesByIds(expensesRaw.map((e) => e.paidBy));

  const preset = detectPreset(clampedFrom, clampedTo, today);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Expenses"
        description="Everything reception never touches — salaries, rent, utilities, supplier invoices paid outside the front desk."
        action={
          <ReportsPicker
            initialFrom={clampedFrom}
            initialTo={clampedTo}
            initialPreset={preset}
            today={today}
            basePath="/expenses"
            presets={["this_month", "last_month", "custom"]}
          />
        }
        animate
      />

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/expenses/pdf-export?from=${clampedFrom}&to=${clampedTo}`}
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
          href={`/expenses/csv-export?from=${clampedFrom}&to=${clampedTo}`}
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

      <ExpensesManager
        currentDate={today}
        rangeFrom={clampedFrom}
        rangeTo={clampedTo}
        showDeleted={showDeleted}
        isOwner={isOwner}
        categories={activeCategories.map((c) => ({ id: c._id.toString(), name: c.name }))}
        paymentMethods={activeMethods.map((m) => ({ id: m._id.toString(), name: m.name }))}
        partners={activePartners.map((p) => ({ id: p._id.toString(), name: p.name }))}
        expenses={activeExpenses.map((e) => ({
          id: e._id.toString(),
          date: e.date,
          categoryId: e.categoryId,
          categoryName: categoryNameById.get(e.categoryId) ?? "Unknown",
          amountSen: e.amountSen,
          paymentMethodId: e.paymentMethodId,
          paymentMethodName: methodById.get(e.paymentMethodId)?.name ?? "Unknown",
          paymentMethodType: methodById.get(e.paymentMethodId)?.type ?? "other",
          paidTo: e.paidTo,
          capitalOrOperating: e.capitalOrOperating,
          reference: e.reference ?? "",
          note: e.note ?? "",
          receiptUrl: e.receiptUrl ?? "",
          enteredBy: userNameById.get(e.paidBy) ?? "Unknown",
          deleted: false,
          deletedReason: "",
        }))}
        deletedExpenses={deletedExpenses.map((e) => ({
          id: e._id.toString(),
          date: e.date,
          categoryId: e.categoryId,
          categoryName: categoryNameById.get(e.categoryId) ?? "Unknown",
          amountSen: e.amountSen,
          paymentMethodId: e.paymentMethodId,
          paymentMethodName: methodById.get(e.paymentMethodId)?.name ?? "Unknown",
          paymentMethodType: methodById.get(e.paymentMethodId)?.type ?? "other",
          paidTo: e.paidTo,
          capitalOrOperating: e.capitalOrOperating,
          reference: e.reference ?? "",
          note: e.note ?? "",
          receiptUrl: e.receiptUrl ?? "",
          enteredBy: userNameById.get(e.paidBy) ?? "Unknown",
          deleted: true,
          deletedReason: e.deletedReason ?? "",
        }))}
      />
    </div>
  );
}
