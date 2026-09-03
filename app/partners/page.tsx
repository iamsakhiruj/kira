import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  ensurePartnerIndexes,
  listPartners,
  getAllShares,
  getRecentTransactions,
  getPartnerBalances,
} from "@/lib/partnersStore";
import { sharesActiveOn } from "@/lib/partners";
import {
  ensurePaymentMethodsIndexes,
  ensurePaymentMethodsSeeded,
  getPaymentMethods,
} from "@/lib/paymentMethodsStore";
import {
  ensureEmployeesIndexes,
  getEmployeesByPartnerId,
} from "@/lib/employeesStore";
import { getSalaryPaymentsForEmployee } from "@/lib/salaryStore";
import PageHeader from "@/components/ui/page-header";
import PartnersManager from "./partners-manager";

export const dynamic = "force-dynamic";

// Today's calendar date in KL, "YYYY-MM-DD" (en-CA renders ISO order).
const klDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  await requireUser("owner");
  const showDeleted = (await searchParams).deleted === "1";

  await Promise.all([
    ensurePartnerIndexes(),
    ensurePaymentMethodsIndexes(),
    ensureEmployeesIndexes(),
  ]);
  await ensurePaymentMethodsSeeded();

  const [partners, shares, transactions, balances, paymentMethods] =
    await Promise.all([
      listPartners(),
      getAllShares(),
      getRecentTransactions(200, showDeleted),
      getPartnerBalances(),
      getPaymentMethods(),
    ]);

  const today = klDate.format(new Date());
  const activeShareRows = sharesActiveOn(
    shares.map((s) => ({ ...s, id: s._id.toString() })),
    today,
  );
  const currentBpByPartner = new Map(
    activeShareRows.map((s) => [s.partnerId, s.percentageBp]),
  );

  const partnerNames = new Map(partners.map((p) => [p._id.toString(), p.name]));
  const methodNames = new Map(paymentMethods.map((m) => [m._id.toString(), m.name]));

  // Linked director salaries, per partner.
  const linkedByPartner = new Map<
    string,
    { id: string; name: string; position: string; payType: string; basicAmountSen: number;
      payments: { id: string; month: string; netSen: number; status: string }[] }[]
  >();
  for (const p of partners) {
    const pid = p._id.toString();
    const emps = await getEmployeesByPartnerId(pid);
    const rows = [];
    for (const e of emps) {
      const eid = e._id.toString();
      const payments = (await getSalaryPaymentsForEmployee(eid)).map((sp) => ({
        id: sp._id.toString(),
        month: sp.month,
        netSen: sp.netSen,
        status: sp.status,
      }));
      rows.push({
        id: eid,
        name: e.name,
        position: e.position,
        payType: e.payType,
        basicAmountSen: e.basicAmountSen,
        payments,
      });
    }
    if (rows.length) linkedByPartner.set(pid, rows);
  }

  const partnerData = partners.map((p) => {
    const id = p._id.toString();
    const bal = balances.get(id) ?? {
      allocatedSen: 0,
      injectionsSen: 0,
      drawingsSen: 0,
      balanceSen: 0,
      directorLoanSen: 0,
    };
    return {
      id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      active: p.active,
      joinedDate: p.joinedDate,
      exitDate: p.exitDate,
      notes: p.notes,
      currentShareBp: currentBpByPartner.get(id) ?? null,
      balance: bal,
      linkedEmployees: linkedByPartner.get(id) ?? [],
    };
  });

  const shareHistory = shares.map((s) => ({
    id: s._id.toString(),
    partnerName: partnerNames.get(s.partnerId) ?? "(unknown)",
    percentageBp: s.percentageBp,
    effectiveFrom: s.effectiveFrom,
    effectiveTo: s.effectiveTo,
  }));

  const txnData = transactions.map((t) => ({
    id: t._id.toString(),
    partnerId: t.partnerId,
    partnerName: partnerNames.get(t.partnerId) ?? "(unknown)",
    date: t.date,
    amountSen: t.amountSen,
    direction: t.direction,
    purpose: t.purpose,
    paymentMethodId: t.paymentMethodId,
    paymentMethodName: methodNames.get(t.paymentMethodId) ?? "—",
    reference: t.reference,
    note: t.note,
    deleted: t.deleted === true,
    deletedReason: t.deletedReason ?? "",
  }));

  const activeMethods = paymentMethods
    .filter((m) => m.active)
    .map((m) => ({ id: m._id.toString(), name: m.name }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Partners"
        description={
          <>
            Owners, their effective-dated shares, and money in and out.
            Balance is allocated profit + injections − drawings — allocated
            profit comes from{" "}
            <Link href="/profit" style={{ color: "var(--brand)" }}>
              locked profit allocations
            </Link>
            .
          </>
        }
        animate
      />
      <PartnersManager
        partners={partnerData}
        shareHistory={shareHistory}
        transactions={txnData}
        paymentMethods={activeMethods}
        today={today}
        showDeleted={showDeleted}
      />
    </div>
  );
}
