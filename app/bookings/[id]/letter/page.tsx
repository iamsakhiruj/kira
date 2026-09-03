import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getBookingById,
  storedRoomLines,
  storedTotalRooms,
  storedRoomNights,
} from "@/lib/bookingsStore";
import { getPaymentsForBooking } from "@/lib/bookingPaymentsStore";
import {
  ensureLetterTemplateIndexes,
  getActiveLetterTemplates,
} from "@/lib/letterTemplatesStore";
import { getCompanyDetails } from "@/lib/companyDetailsStore";
import {
  summarisePayments,
  defaultLetterConfig,
  LetterConfigSchema,
  type BookingStatus,
  type PaymentType,
  type LetterConfig,
} from "@/lib/bookings";
import LetterEditor from "./letter-editor";

export const dynamic = "force-dynamic";

export default async function LetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser(); // generating a letter is reception+
  const { id } = await params;
  const b = await getBookingById(id);
  if (!b) notFound();

  await ensureLetterTemplateIndexes();
  const [payments, templates, company] = await Promise.all([
    getPaymentsForBooking(id),
    getActiveLetterTemplates(),
    getCompanyDetails(),
  ]);

  const summary = summarisePayments(
    payments.map((p) => ({
      amountSen: Number(p.amountSen) || 0,
      type: p.type as PaymentType,
    })),
  );

  // The stored config from last time (so a reprint matches), else the default
  // (every clause, standard fields). Validated in case the shape drifted.
  const stored = b.lastLetterConfig
    ? LetterConfigSchema.safeParse(b.lastLetterConfig)
    : null;
  const initialConfig: LetterConfig =
    stored && stored.success ? stored.data : defaultLetterConfig();

  return (
    <LetterEditor
      bookingId={id}
      company={company}
      booking={{
        reference: String(b.reference),
        guestName: String(b.guestName ?? ""),
        guestIdNumber: String(b.guestIdNumber ?? ""),
        nationality: String(b.nationality ?? ""),
        phone: String(b.phone ?? ""),
        email: String(b.email ?? ""),
        checkIn: String(b.checkIn ?? ""),
        checkOut: String(b.checkOut ?? ""),
        totalRooms: storedTotalRooms(b),
        roomNights: storedRoomNights(b),
        rooms: storedRoomLines(b),
        tourismTaxApplicable: Boolean(b.tourismTaxApplicable),
        tourismTaxPerRoomPerNightSen: Number(b.tourismTaxPerRoomPerNightSen) || 0,
        roomRevenueSen: Number(b.roomRevenueSen) || 0,
        tourismTaxSen: Number(b.tourismTaxSen) || 0,
        grandTotalSen: Number(b.grandTotalSen) || 0,
        status: (b.status as BookingStatus) ?? "confirmed",
      }}
      paidSen={summary.netPaidSen}
      initialConfig={initialConfig}
      templates={templates.map((t) => ({
        id: t._id.toString(),
        name: String(t.name),
        show: t.show,
        clauseKeys: (t.clauseKeys as string[]) ?? [],
        defaultRemarks: String(t.defaultRemarks ?? ""),
      }))}
    />
  );
}
