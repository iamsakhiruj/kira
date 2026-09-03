import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import {
  ensureCategoriesIndexes,
  ensureCategoriesSeeded,
  getActiveCategories,
} from "@/lib/categoriesStore";
import {
  ensurePaymentMethodsIndexes,
  ensurePaymentMethodsSeeded,
  getPaymentMethods,
} from "@/lib/paymentMethodsStore";
import { ensureExpensesIndexes, getRecentExpenses } from "@/lib/expensesStore";
import PageHeader from "@/components/ui/page-header";
import ExpensesManager from "./expenses-manager";

// Depends on request-time data; never prerender.
export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const showDeleted = (await searchParams).deleted === "1";
  const settings = await getSettings();
  const currentDate = businessDateFor(new Date(), settings.cutoffHour);

  await Promise.all([
    ensureCategoriesIndexes(),
    ensureCategoriesSeeded(),
    ensurePaymentMethodsIndexes(),
    ensurePaymentMethodsSeeded(),
    ensureExpensesIndexes(),
  ]);

  const [categories, methods, expenses] = await Promise.all([
    getActiveCategories("expense"),
    getPaymentMethods(),
    getRecentExpenses(200, showDeleted),
  ]);
  const activeMethods = methods.filter((m) => m.active);

  const categoryNameById = new Map(categories.map((c) => [c._id.toString(), c.name]));
  const methodNameById = new Map(methods.map((m) => [m._id.toString(), m.name]));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Expenses"
        description="Everything reception never touches — salaries, rent, utilities, supplier invoices paid outside the front desk."
        animate
      />
      <ExpensesManager
        currentDate={currentDate}
        showDeleted={showDeleted}
        categories={categories.map((c) => ({ id: c._id.toString(), name: c.name }))}
        paymentMethods={activeMethods.map((m) => ({ id: m._id.toString(), name: m.name }))}
        expenses={expenses.map((e) => ({
          id: e._id.toString(),
          date: e.date,
          categoryId: e.categoryId,
          categoryName: categoryNameById.get(e.categoryId) ?? "Unknown",
          amountSen: e.amountSen,
          paymentMethodId: e.paymentMethodId,
          paymentMethodName: methodNameById.get(e.paymentMethodId) ?? "Unknown",
          paidTo: e.paidTo,
          capitalOrOperating: e.capitalOrOperating,
          reference: e.reference ?? "",
          note: e.note ?? "",
          receiptUrl: e.receiptUrl ?? "",
          deleted: e.deleted === true,
          deletedReason: e.deletedReason ?? "",
        }))}
      />
    </div>
  );
}
