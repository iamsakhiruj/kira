import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getUserById } from "@/lib/users";
import {
  getBookingById,
  storedRoomLines,
  storedTotalRooms,
  storedRoomNights,
} from "@/lib/bookingsStore";
import {
  ensureBookingPaymentIndexes,
  getPaymentsForBooking,
} from "@/lib/bookingPaymentsStore";
import {
  ensurePaymentMethodsIndexes,
  ensurePaymentMethodsSeeded,
  getPaymentMethods,
} from "@/lib/paymentMethodsStore";
import type { BookingSource, BookingStatus, PaymentType } from "@/lib/bookings";
import BookingDetail from "./booking-detail";

export const dynamic = "force-dynamic";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;
  const b = await getBookingById(id);
  if (!b) notFound();

  await ensureBookingPaymentIndexes();
  await ensurePaymentMethodsIndexes();
  await ensurePaymentMethodsSeeded();
  const [payments, methods] = await Promise.all([
    getPaymentsForBooking(id),
    getPaymentMethods(),
  ]);
  const methodNameById = new Map(methods.map((m) => [m._id.toString(), m.name]));
  const canManage = isAuthorized(user?.role ?? "reception", "manager");

  // Resolve who cancelled (stored as a user id) to a name for display.
  const c = b.cancellation as Record<string, unknown> | undefined;
  const cancelledByUser = c?.cancelledBy
    ? await getUserById(String(c.cancelledBy))
    : null;
  const cancellation = c
    ? {
        reason: String(c.reason ?? ""),
        cancelledByName: cancelledByUser?.name ?? "Unknown",
        cancelledOn: String(c.cancelledOn ?? ""),
        bookingValueSen: Number(c.bookingValueSen) || 0,
        depositHeldSen: Number(c.depositHeldSen) || 0,
        refundedSen: Number(c.refundedSen) || 0,
        forfeitedSen: Number(c.forfeitedSen) || 0,
      }
    : null;

  return (
    <BookingDetail
      canManage={canManage}
      booking={{
        id,
        reference: String(b.reference),
        guestName: String(b.guestName ?? ""),
        guestIdNumber: String(b.guestIdNumber ?? ""),
        nationality: String(b.nationality ?? ""),
        email: String(b.email ?? ""),
        phone: String(b.phone ?? ""),
        address: String(b.address ?? ""),
        tin: String(b.tin ?? ""),
        checkIn: String(b.checkIn ?? ""),
        checkOut: String(b.checkOut ?? ""),
        totalRooms: storedTotalRooms(b),
        roomNights: storedRoomNights(b),
        rooms: storedRoomLines(b),
        tourismTaxApplicable: Boolean(b.tourismTaxApplicable),
        tourismTaxPerRoomPerNightSen: Number(b.tourismTaxPerRoomPerNightSen) || 0,
        tourismTaxOverrideReason: String(b.tourismTaxOverrideReason ?? ""),
        roomRevenueSen: Number(b.roomRevenueSen) || 0,
        tourismTaxSen: Number(b.tourismTaxSen) || 0,
        grandTotalSen: Number(b.grandTotalSen) || 0,
        status: (b.status as BookingStatus) ?? "confirmed",
        source: (b.source as BookingSource) ?? "direct_phone",
        notes: String(b.notes ?? ""),
        cancellation,
      }}
      payments={payments.map((p) => ({
        id: p._id.toString(),
        date: String(p.date),
        amountSen: Number(p.amountSen) || 0,
        type: p.type as PaymentType,
        paymentMethodId: String(p.paymentMethodId ?? ""),
        methodName: methodNameById.get(String(p.paymentMethodId)) ?? "Unknown",
        reference: String(p.reference ?? ""),
        note: String(p.note ?? ""),
      }))}
      paymentMethods={methods
        .filter((m) => m.active)
        .map((m) => ({ id: m._id.toString(), name: m.name }))}
    />
  );
}
