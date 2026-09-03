import Link from "next/link";
import { formatRM } from "@/lib/money";
import {
  ensureBookingIndexes,
  listBookings,
  storedTotalRooms,
} from "@/lib/bookingsStore";
import {
  ensureBookingPaymentIndexes,
  getPaymentsForBookings,
} from "@/lib/bookingPaymentsStore";
import {
  outstandingSen,
  formatBookingRef,
  type BookingStatus,
  type PaymentType,
} from "@/lib/bookings";
import PageHeader from "@/components/ui/page-header";
import DataTable from "@/components/ui/data-table";
import Badge, { type BadgeTone } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};
const STATUS_TONE: Record<BookingStatus, BadgeTone> = {
  confirmed: "neutral",
  checked_in: "brand",
  checked_out: "muted",
  cancelled: "muted",
  no_show: "warn",
};

function isCancelledStatus(status: string): boolean {
  return status === "cancelled" || status === "no_show";
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const showAll = (await searchParams).show === "all";

  await ensureBookingIndexes();
  await ensureBookingPaymentIndexes();
  const allBookings = await listBookings();
  // Cancelled / no-show stay in the system but are filtered out of the list by
  // default (visible via the toggle, and greyed when shown).
  const hiddenCount = allBookings.filter((b) =>
    isCancelledStatus(String(b.status)),
  ).length;
  const bookings = showAll
    ? allBookings
    : allBookings.filter((b) => !isCancelledStatus(String(b.status)));

  const ids = bookings.map((b) => b._id.toString());
  const payments = await getPaymentsForBookings(ids);

  const paymentsByBooking = new Map<
    string,
    { amountSen: number; type: PaymentType }[]
  >();
  for (const p of payments) {
    const key = String(p.bookingId);
    const list = paymentsByBooking.get(key) ?? [];
    list.push({ amountSen: Number(p.amountSen) || 0, type: p.type as PaymentType });
    paymentsByBooking.set(key, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Bookings"
        description="Direct reservations taken by phone, walk-in or email — with payment tracking and a confirmation letter."
        action={
          <div className="flex items-center gap-2">
            {showAll ? (
              <Link
                href="/bookings"
                className="flex h-11 items-center rounded-card border px-4"
                style={{ borderColor: "var(--border-strong)", color: "var(--text-muted)" }}
              >
                Hide cancelled
              </Link>
            ) : hiddenCount > 0 ? (
              <Link
                href="/bookings?show=all"
                className="flex h-11 items-center rounded-card border px-4"
                style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}
              >
                Show cancelled ({hiddenCount})
              </Link>
            ) : null}
            <Link
              href="/bookings/new"
              className="btn-primary flex h-11 items-center rounded-card px-4 font-medium"
            >
              New booking
            </Link>
          </div>
        }
        animate
      />
      <DataTable
        columns={[
          { key: "ref", header: "Reference" },
          { key: "guest", header: "Guest" },
          { key: "stay", header: "Stay" },
          { key: "status", header: "Status" },
          { key: "total", header: "Total", align: "right" },
          { key: "outstanding", header: "Outstanding", align: "right" },
        ]}
        isEmpty={bookings.length === 0}
        emptyMessage="No bookings yet."
      >
        {bookings.map((b) => {
          const id = b._id.toString();
          const status = b.status as BookingStatus;
          const grand = Number(b.grandTotalSen) || 0;
          const totalRooms = storedTotalRooms(b);
          const outstanding = outstandingSen(grand, paymentsByBooking.get(id) ?? []);
          const greyed = isCancelledStatus(status);
          return (
            <tr
              key={id}
              className="table-row-hover"
              style={{ borderBottom: "1px solid var(--border)", opacity: greyed ? 0.55 : 1 }}
            >
              <td className="px-4 py-3">
                <Link href={`/bookings/${id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
                  {b.reference ?? formatBookingRef(2026, 0)}
                </Link>
              </td>
              <td className="px-4 py-3">{b.guestName}</td>
              <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                {b.checkIn} → {b.checkOut} · {totalRooms} room
                {totalRooms === 1 ? "" : "s"}
              </td>
              <td className="px-4 py-3">
                <Badge tone={STATUS_TONE[status]} variant="solid">
                  {STATUS_LABELS[status]}
                </Badge>
              </td>
              <td className="px-4 py-3 money">{formatRM(grand)}</td>
              <td className="px-4 py-3 money">
                {outstanding > 0 ? (
                  <span className="money-out">{formatRM(outstanding)}</span>
                ) : (
                  formatRM(outstanding)
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
