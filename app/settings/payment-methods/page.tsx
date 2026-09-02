import {
  ensurePaymentMethodsIndexes,
  ensurePaymentMethodsSeeded,
  getPaymentMethods,
} from "@/lib/paymentMethodsStore";
import { ensureAccountsIndexes, ensureAccountsSeeded, getAllAccounts } from "@/lib/accountsStore";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import PageHeader from "@/components/ui/page-header";
import PaymentMethodsManager from "./payment-methods-manager";

// Reads the current list on every request; cheap, and avoids a stale list
// after an edit.
export const dynamic = "force-dynamic";

export default async function PaymentMethodsPage() {
  const settings = await getSettings();
  const today = businessDateFor(new Date(), settings.cutoffHour);

  await ensurePaymentMethodsIndexes();
  await ensurePaymentMethodsSeeded();
  await ensureAccountsIndexes();
  await ensureAccountsSeeded(today); // also backfills the "obvious" accountId links

  const [methods, accounts] = await Promise.all([getPaymentMethods(), getAllAccounts()]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Payment methods"
        description="Used across revenue, expenses, partner transactions and salary payments. Deactivate a method instead of deleting it — anything already recorded against it keeps working. The Account column decides which accounts balance a method's money lands in."
        animate
      />
      <PaymentMethodsManager
        methods={methods.map((m) => ({
          id: m._id.toString(),
          name: m.name,
          type: m.type,
          active: m.active,
          displayOrder: m.displayOrder,
          accountId: m.accountId,
        }))}
        accounts={accounts.map((a) => ({ id: a._id.toString(), name: a.name, active: a.active }))}
      />
    </div>
  );
}
