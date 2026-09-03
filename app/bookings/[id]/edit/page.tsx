import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { fromSen } from "@/lib/money";
import { getBookingById, storedRoomLines } from "@/lib/bookingsStore";
import type { BookingSource, BookingStatus } from "@/lib/bookings";
import { resolveCountryCode } from "@/lib/countries";
import PageHeader from "@/components/ui/page-header";
import BookingForm, { type BookingFormValues } from "../../booking-form";

export const dynamic = "force-dynamic";

export default async function EditBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Editing a booking is manager+ (brief §5). The layout only gates "any
  // authenticated"; this is the real gate. editBooking re-checks server-side.
  await requireUser("manager");

  const { id } = await params;
  const b = await getBookingById(id);
  if (!b) notFound();

  const bookingCheckIn = String(b.checkIn ?? "");
  const bookingCheckOut = String(b.checkOut ?? "");
  // Legacy-safe: an old single-room booking normalizes to one line here.
  const storedRooms = storedRoomLines(b);

  const initial: BookingFormValues = {
    guestName: String(b.guestName ?? ""),
    guestIdNumber: String(b.guestIdNumber ?? ""),
    // Legacy bookings may hold a free-text nationality — resolve to a code
    // (empty if unresolvable, which makes the manager pick one on save).
    nationality: resolveCountryCode(String(b.nationality ?? "")),
    email: String(b.email ?? ""),
    phone: String(b.phone ?? ""),
    address: String(b.address ?? ""),
    tin: String(b.tin ?? ""),
    checkIn: bookingCheckIn,
    checkOut: bookingCheckOut,
    rooms: storedRooms.map((l, i) => {
      const lineIn = String(l.checkIn ?? bookingCheckIn);
      const lineOut = String(l.checkOut ?? bookingCheckOut);
      // A line whose dates differ from the booking span is shown as overridden.
      const overrideDates = lineIn !== bookingCheckIn || lineOut !== bookingCheckOut;
      return {
        id: i,
        roomType: String(l.roomType ?? ""),
        roomsCount: String(l.roomsCount ?? 1),
        rate: fromSen(Number(l.ratePerNightSen) || 0),
        overrideDates,
        checkIn: lineIn,
        checkOut: lineOut,
      };
    }),
    tourismTaxApplicable: Boolean(b.tourismTaxApplicable),
    tourismTaxRate: fromSen(Number(b.tourismTaxPerRoomPerNightSen) || 0),
    tourismTaxOverrideReason: String(b.tourismTaxOverrideReason ?? ""),
    status: (b.status as BookingStatus) ?? "confirmed",
    source: (b.source as BookingSource) ?? "direct_phone",
    notes: String(b.notes ?? ""),
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`Edit ${b.reference}`}
        description="Editing changes the figures in place and regenerates the booking's nightly accrual."
        animate
      />
      <BookingForm mode="edit" bookingId={id} initial={initial} canSetStatus />
    </div>
  );
}
