import type { Document, WithId } from "mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import {
  businessDateFor,
  lastBusinessDates,
  datesSinceFirstReport,
  businessDateMinusDays,
  formatBusinessDateLabel,
} from "@/lib/businessDate";
import { getBusinessDaysByDates, getEarliestBusinessDate } from "@/lib/businessDays";
import {
  ensureBookingIndexes,
  getBookingAccrualByDates,
} from "@/lib/bookingsStore";
import {
  ensureCategoriesIndexes,
  ensureCategoriesSeeded,
  getActiveCategories,
} from "@/lib/categoriesStore";
import {
  ensureOtaPlatformsIndexes,
  ensureOtaPlatformsSeeded,
  getActiveOtaPlatforms,
} from "@/lib/otaPlatformsStore";
import { totalRevenueSen } from "@/lib/nightReport";
import {
  getCorrectionRequestsByRequester,
  ensureCorrectionRequestIndexes,
} from "@/lib/correctionRequestsStore";
import NightReportScreen, {
  type DaySlot,
  type DaySummary,
} from "./night-report-screen";
import ApprovalQueue from "./approval-queue";
import MyCorrectionsSection from "./my-corrections-section";
import SubmitSection from "./submit-section";

// The report and cash count depend on request-time data; never prerender.
export const dynamic = "force-dynamic";

const RECEPTION_BACKFILL_DAYS = 7;

function summarize(
  doc: WithId<Document>,
  currentUserId: string,
  currentUserRole: string,
): DaySummary {
  const roomRevenueSen: number = doc.rooms?.revenueSen ?? 0;
  const revenueLines: { amountSen: number }[] = doc.revenueLines ?? [];
  const status = String(doc.status ?? "submitted");
  const canCorrectStatus = status === "submitted" || status === "approved";
  const isReception = currentUserRole === "reception";
  const isOwnReport = String(doc.submittedBy) === currentUserId;
  return {
    status,
    roomsSold: doc.rooms?.sold ?? 0,
    roomsAvailable: doc.rooms?.available ?? 0,
    totalRevenueSen: totalRevenueSen(roomRevenueSen, revenueLines),
    countedSen: doc.cash?.countedSen ?? 0,
    varianceSen: doc.cash?.varianceSen ?? 0,
    varianceReason: doc.cash?.varianceReason ?? "",
    revenueGapSen: doc.revenueGapSen ?? 0,
    revenueGapReason: doc.revenueGapReason ?? "",
    businessDayId: doc._id.toString(),
    // Reception may only raise corrections on their own reports; manager/owner
    // may raise against any submitted or approved report. Server-computed so
    // the client never makes this decision.
    canRequestCorrection:
      canCorrectStatus && (!isReception || isOwnReport),
  };
}

export default async function ReceptionHome() {
  // Cheap, JWT-only — a UI hint (the date picker's lower bound), not the
  // security decision. The layout's requireUser("reception") already gated
  // this route (owner passes via the role hierarchy); submitNightReport()
  // re-checks the role authoritatively regardless of what's shown here.
  const user = await getCurrentUser();
  const settings = await getSettings();
  const current = businessDateFor(new Date(), settings.cutoffHour);
  const window7 = lastBusinessDates(current, RECEPTION_BACKFILL_DAYS);

  await ensureCategoriesIndexes();
  await ensureCategoriesSeeded();
  await ensureCorrectionRequestIndexes();
  await ensureOtaPlatformsIndexes();
  await ensureOtaPlatformsSeeded();
  await ensureBookingIndexes();

  const [docs, earliestDate, revenueCats, expenseCats, otaPlatformDocs, bookingAccrual] =
    await Promise.all([
      getBusinessDaysByDates(window7),
      getEarliestBusinessDate(),
      getActiveCategories("revenue"),
      getActiveCategories("expense"),
      getActiveOtaPlatforms(),
      // Booking accrual for each of the 7 window dates — the read-only
      // "from bookings staying tonight" line on the night report (brief §4).
      getBookingAccrualByDates(window7),
    ]);
  const bookingAccrualByDate: Record<
    string,
    { roomsCount: number; roomRevenueSen: number; tourismTaxSen: number }
  > = {};
  for (const d of window7) {
    const a = bookingAccrual.get(d);
    if (a) bookingAccrualByDate[d] = a;
  }
  const otaPlatforms = otaPlatformDocs.map((p) => ({
    id: p._id.toString(),
    name: p.name,
    guestPaysPlatform: p.guestPaysPlatform,
  }));
  // The night report's own pickers never show standalone-only categories
  // (e.g. "Rent") — those belong on the 2.3 expenses/revenue screens only.
  const revenueCategoryNames = revenueCats
    .filter((c) => !c.standaloneOnly)
    .map((c) => c.name);
  const expenseCategoryNames = expenseCats
    .filter((c) => !c.standaloneOnly)
    .map((c) => c.name);
  const docByDate = new Map(docs.map((d) => [String(d.date), d]));
  // Dates that already have a report — the form uses this to warn instead of
  // offering a blank form that would fail the unique index on submit.
  const existingDates = [...docByDate.keys()];

  // House rule: submit tonight's report before the shift hands over, not the
  // next day. If it isn't in yet, prompt prominently — a nudge, never a block
  // (reception can always submit whenever they get to it).
  const tonightSubmitted = docByDate.has(current);

  // Never prompt for a "missing" report from before the property started
  // using this system — that's not a gap, it just hadn't started yet.
  const dates = datesSinceFirstReport(window7, earliestDate, current);
  const previous = dates.at(-2) ?? current;

  const userId = user?.sub ?? "";
  const userRole = user?.role ?? "reception";

  const slots: DaySlot[] = dates
    .slice()
    .reverse() // newest first: tonight, yesterday, then older missing days
    .map((date) => {
      const doc = docByDate.get(date);
      const isRecent = date === current || date === previous;
      const label = isRecent
        ? date === current
          ? `Tonight — ${date}`
          : `Yesterday — ${date}`
        : formatBusinessDateLabel(date);
      return {
        date,
        label,
        isRecent,
        summary: doc ? summarize(doc, userId, userRole) : null,
      };
    });

  const minDate =
    user?.role === "reception"
      ? businessDateMinusDays(current, RECEPTION_BACKFILL_DAYS - 1)
      : undefined;

  const isReception = userRole === "reception";

  // Fetch reception's own correction requests only for reception role.
  // Manager/owner see corrections in the approval queue instead.
  const myCorrections = isReception
    ? await getCorrectionRequestsByRequester(userId)
    : [];

  const screen = (
    <NightReportScreen
      slots={slots}
      currentDate={current}
      minDate={minDate}
      maxDate={current}
      defaults={{
        roomsAvailable: settings.roomsAvailable,
        openingFloatSen: settings.openingFloatSen,
      }}
      varianceThresholdSen={settings.varianceThresholdSen}
      revenueGapThresholdSen={settings.revenueGapThresholdSen}
      expenseCeilingSen={settings.expenseCeilingSen}
      revenueCategoryNames={revenueCategoryNames}
      expenseCategoryNames={expenseCategoryNames}
      otaPlatforms={otaPlatforms}
      existingDates={existingDates}
      bookingAccrualByDate={bookingAccrualByDate}
    />
  );

  // Reception: the night report form is the job — form first. The
  // "tonight not submitted" nudge is theirs (they submit before handover).
  if (isReception) {
    return (
      <div className="flex flex-col gap-8">
        {!tonightSubmitted ? (
          <div
            className="rounded-card border p-4"
            style={{ background: "var(--warn-bg)", borderColor: "var(--warn)", color: "var(--text)" }}
          >
            <p style={{ fontWeight: 600, color: "var(--warn)" }}>
              Tonight&apos;s report is not submitted yet
            </p>
            <p style={{ fontSize: "var(--text-label)" }}>
              Complete it before you hand over.
            </p>
          </div>
        ) : null}
        {screen}
        {myCorrections.length > 0 ? (
          <MyCorrectionsSection corrections={myCorrections} />
        ) : null}
      </div>
    );
  }

  // Owner/manager come here to approve — queue and correction requests first,
  // the submit form collapsed below and out of the way. No "tonight not
  // submitted" nudge: the nightly submit isn't their job.
  return (
    <div className="flex flex-col gap-8">
      <ApprovalQueue />
      <SubmitSection>{screen}</SubmitSection>
    </div>
  );
}
