import { requireUser } from "@/lib/auth";
import { fromSen } from "@/lib/money";
import { TOURISM_TAX_PER_ROOM_PER_NIGHT_SEN } from "@/lib/bookings";
import { MALAYSIA_CODE } from "@/lib/countries";
import PageHeader from "@/components/ui/page-header";
import BookingForm, { type BookingFormValues } from "../booking-form";

export const dynamic = "force-dynamic";

// Built here (a Server Component) rather than by a helper exported from the
// client form module — a "use client" export can't be *called* from the
// server, only rendered.
const emptyValues: BookingFormValues = {
  guestName: "",
  guestIdNumber: "",
  // Default to Malaysia (the most common guest) — which also sets the tourism
  // tax default OFF. Picking a foreign country flips it on.
  nationality: MALAYSIA_CODE,
  email: "",
  phone: "",
  address: "",
  tin: "",
  checkIn: "",
  checkOut: "",
  // The common case starts with one room line, dates inherited from the
  // booking (no per-line date fields shown until the guest ticks "different
  // dates").
  rooms: [
    {
      id: 0,
      roomType: "",
      roomsCount: "1",
      rate: "",
      overrideDates: false,
      checkIn: "",
      checkOut: "",
    },
  ],
  tourismTaxApplicable: false, // Malaysian default
  tourismTaxRate: fromSen(TOURISM_TAX_PER_ROOM_PER_NIGHT_SEN),
  tourismTaxOverrideReason: "",
  status: "confirmed",
  source: "direct_phone",
  notes: "",
};

export default async function NewBookingPage() {
  await requireUser(); // reception+ — the layout already gated; this is explicit

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="New booking" description="A direct reservation." animate />
      {/* Status isn't settable on create — a new booking is always "confirmed";
          check-in/out and cancellation are manager+ actions from the detail
          screen. */}
      <BookingForm mode="new" initial={emptyValues} canSetStatus={false} />
    </div>
  );
}
