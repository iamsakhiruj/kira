import {
  ensurePaymentMethodsIndexes,
  ensurePaymentMethodsSeeded,
  getPaymentMethods,
} from "@/lib/paymentMethodsStore";
import PaymentMethodsManager from "./payment-methods-manager";

// Reads the current list on every request; cheap, and avoids a stale list
// after an edit.
export const dynamic = "force-dynamic";

export default async function PaymentMethodsPage() {
  await ensurePaymentMethodsIndexes();
  await ensurePaymentMethodsSeeded();
  const methods = await getPaymentMethods();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
          Payment methods
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Used across revenue, expenses, partner transactions and salary payments.
          Deactivate a method instead of deleting it — anything already recorded
          against it keeps working.
        </p>
      </div>
      <PaymentMethodsManager
        methods={methods.map((m) => ({
          id: m._id.toString(),
          name: m.name,
          type: m.type,
          active: m.active,
          displayOrder: m.displayOrder,
        }))}
      />
    </div>
  );
}
