import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import {
  getBusinessDaysBetween,
  getAllBusinessDaysWithOtaBookings,
} from "@/lib/businessDays";
import {
  ensureOtaPlatformsIndexes,
  ensureOtaPlatformsSeeded,
  getOtaPlatforms,
} from "@/lib/otaPlatformsStore";
import {
  ensureOtaRemittancesIndexes,
  getAllOtaRemittances,
} from "@/lib/otaRemittancesStore";
import {
  ensurePaymentMethodsIndexes,
  ensurePaymentMethodsSeeded,
  getPaymentMethods,
} from "@/lib/paymentMethodsStore";
import { otaBookingsSummary, otaPlatformBalances } from "@/lib/otaSummary";
import { thisMonthRange, detectPreset, rangeLabel } from "@/lib/dateRangePresets";
import ReportsPicker from "@/app/reports/reports-view";
import PageHeader from "@/components/ui/page-header";
import OtaClient from "./ota-client";

// Depends on request-time data (bookings, remittances); never prerender.
export const dynamic = "force-dynamic";

export default async function OtaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; deleted?: string }>;
}) {
  const settings = await getSettings();
  const params = await searchParams;
  const showDeleted = params.deleted === "1";

  const today = businessDateFor(new Date(), settings.cutoffHour);
  const defaultRange = thisMonthRange(today);

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const rangeFrom =
    params.from && DATE_RE.test(params.from) ? params.from : defaultRange.from;
  const rangeTo =
    params.to && DATE_RE.test(params.to)
      ? params.to
      : params.from && DATE_RE.test(params.from)
      ? params.from
      : defaultRange.to;

  const clampedFrom = rangeFrom <= today ? rangeFrom : today;
  const clampedTo =
    rangeTo >= clampedFrom ? (rangeTo <= today ? rangeTo : today) : clampedFrom;

  await Promise.all([
    ensureOtaPlatformsIndexes(),
    ensureOtaPlatformsSeeded(),
    ensureOtaRemittancesIndexes(),
    ensurePaymentMethodsIndexes(),
    ensurePaymentMethodsSeeded(),
  ]);

  const [daysInRange, allDaysWithOta, allRemittances, remittancesForList, platforms, paymentMethods] =
    await Promise.all([
      getBusinessDaysBetween(clampedFrom, clampedTo),
      getAllBusinessDaysWithOtaBookings(),
      getAllOtaRemittances(), // balances always exclude deleted
      getAllOtaRemittances(showDeleted), // the history list may include them
      getOtaPlatforms(),
      getPaymentMethods(),
    ]);

  type OtaBookingLine = {
    platformId: string;
    bookingsCount: number;
    roomRevenueSen: number;
    guestPaidPlatform: boolean;
  };
  const toOtaBookings = (doc: Record<string, unknown>) =>
    (doc.otaBookings as OtaBookingLine[] | undefined) ?? [];

  const bookingsSummary = otaBookingsSummary(
    daysInRange.map((d) => ({ otaBookings: toOtaBookings(d) })),
  );
  const bookingsByPlatform = new Map(bookingsSummary.map((r) => [r.platformId, r]));

  const balances = otaPlatformBalances(
    allDaysWithOta.map((d) => ({ otaBookings: toOtaBookings(d) })),
    allRemittances.map((r) => ({
      platformId: r.platformId,
      amountReceivedSen: r.amountReceivedSen,
      outstandingCoveredSen: r.outstandingCoveredSen,
    })),
  );

  const rows = platforms
    .filter((p) => p.active)
    .map((p) => {
      const id = p._id.toString();
      const booking = bookingsByPlatform.get(id);
      const balance = balances.get(id);
      return {
        platformId: id,
        name: p.name,
        bookingsCount: booking?.bookingsCount ?? 0,
        revenueBookedSen: booking?.revenueBookedSen ?? 0,
        receivedSen: balance?.receivedSen ?? 0,
        outstandingSen: balance?.outstandingSen ?? 0,
      };
    });

  const preset = detectPreset(clampedFrom, clampedTo, today);

  const platformNameById = new Map(platforms.map((p) => [p._id.toString(), p.name]));
  const methodNameById = new Map(paymentMethods.map((m) => [m._id.toString(), m.name]));
  const remittances = remittancesForList
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((r) => ({
      id: r._id.toString(),
      platformId: r.platformId,
      platformName: platformNameById.get(r.platformId) ?? "Unknown",
      date: r.date,
      amountReceivedSen: r.amountReceivedSen,
      outstandingCoveredSen: r.outstandingCoveredSen,
      paymentMethodId: r.paymentMethodId,
      paymentMethodName: methodNameById.get(r.paymentMethodId) ?? "—",
      reference: r.reference ?? "",
      note: r.note ?? "",
      deleted: r.deleted === true,
      deletedReason: r.deletedReason ?? "",
    }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="OTA"
        description={rangeLabel(clampedFrom, clampedTo)}
        action={
          <ReportsPicker
            initialFrom={clampedFrom}
            initialTo={clampedTo}
            initialPreset={preset}
            today={today}
            basePath="/ota"
          />
        }
        animate
      />
      <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
        Bookings and revenue booked reflect the date range above. Received
        and outstanding are always the platform&apos;s current all-time
        balance, not scoped to that range.
      </p>
      <OtaClient
        rows={rows}
        remittances={remittances}
        showDeleted={showDeleted}
        activePlatforms={platforms
          .filter((p) => p.active)
          .map((p) => ({ id: p._id.toString(), name: p.name }))}
        paymentMethods={paymentMethods
          .filter((m) => m.active)
          .map((m) => ({ id: m._id.toString(), name: m.name }))}
        today={today}
      />
    </div>
  );
}
