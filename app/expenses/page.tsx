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
import ExpensesManager from "./expenses-manager";

// Depends on request-time data; never prerender.
export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
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
    getRecentExpenses(),
  ]);
  const activeMethods = methods.filter((m) => m.active);

  const categoryNameById = new Map(categories.map((c) => [c._id.toString(), c.name]));
  const methodNameById = new Map(methods.map((m) => [m._id.toString(), m.name]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
          Expenses
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Everything reception never touches — salaries, rent, utilities,
          supplier invoices paid outside the front desk.
        </p>
      </div>
      <ExpensesManager
        currentDate={currentDate}
        categories={categories.map((c) => ({ id: c._id.toString(), name: c.name }))}
        paymentMethods={activeMethods.map((m) => ({ id: m._id.toString(), name: m.name }))}
        expenses={expenses.map((e) => ({
          id: e._id.toString(),
          date: e.date,
          categoryName: categoryNameById.get(e.categoryId) ?? "Unknown",
          amountSen: e.amountSen,
          paymentMethodName: methodNameById.get(e.paymentMethodId) ?? "Unknown",
          paidTo: e.paidTo,
          capitalOrOperating: e.capitalOrOperating,
        }))}
      />
    </div>
  );
}
