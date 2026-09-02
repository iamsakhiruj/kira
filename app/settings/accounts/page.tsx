import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { ensureAccountsIndexes, ensureAccountsSeeded, getAllAccounts } from "@/lib/accountsStore";
import PageHeader from "@/components/ui/page-header";
import AccountsManager from "./accounts-manager";

// Reads the current list on every request; cheap, and avoids a stale list
// after an edit.
export const dynamic = "force-dynamic";

export default async function AccountsSettingsPage() {
  const settings = await getSettings();
  const today = businessDateFor(new Date(), settings.cutoffHour);

  await ensureAccountsIndexes();
  await ensureAccountsSeeded(today);
  const accounts = await getAllAccounts();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Accounts"
        description="One balance per place money is held. Seeded from Cash / Bank / E-wallet — set each one's real opening balance and date, then link payment methods to the right account at Settings > Payment methods."
        animate
      />
      <AccountsManager
        accounts={accounts.map((a) => ({
          id: a._id.toString(),
          name: a.name,
          type: a.type,
          openingBalanceSen: a.openingBalanceSen,
          openingDate: a.openingDate,
          active: a.active,
          displayOrder: a.displayOrder,
        }))}
      />
    </div>
  );
}
