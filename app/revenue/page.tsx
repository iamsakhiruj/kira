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
import { ensureRevenueEntriesIndexes, getRecentRevenueEntries } from "@/lib/revenueEntriesStore";
import PageHeader from "@/components/ui/page-header";
import RevenueManager from "./revenue-manager";

// Depends on request-time data; never prerender.
export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const settings = await getSettings();
  const currentDate = businessDateFor(new Date(), settings.cutoffHour);

  await Promise.all([
    ensureCategoriesIndexes(),
    ensureCategoriesSeeded(),
    ensurePaymentMethodsIndexes(),
    ensurePaymentMethodsSeeded(),
    ensureRevenueEntriesIndexes(),
  ]);

  const [categories, methods, entries] = await Promise.all([
    getActiveCategories("revenue"),
    getPaymentMethods(),
    getRecentRevenueEntries(),
  ]);
  const activeMethods = methods.filter((m) => m.active);

  const categoryNameById = new Map(categories.map((c) => [c._id.toString(), c.name]));
  const methodNameById = new Map(methods.map((m) => [m._id.toString(), m.name]));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Revenue"
        description="Money that arrives outside the front desk — an OTA payout, a corporate payment landing directly in the account."
        animate
      />
      <RevenueManager
        currentDate={currentDate}
        categories={categories.map((c) => ({ id: c._id.toString(), name: c.name }))}
        paymentMethods={activeMethods.map((m) => ({ id: m._id.toString(), name: m.name }))}
        entries={entries.map((e) => ({
          id: e._id.toString(),
          date: e.date,
          categoryName: categoryNameById.get(e.categoryId) ?? "Unknown",
          amountSen: e.amountSen,
          paymentMethodName: methodNameById.get(e.paymentMethodId) ?? "Unknown",
          receivedFrom: e.receivedFrom,
        }))}
      />
    </div>
  );
}
