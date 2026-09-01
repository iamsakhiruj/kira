import type { Document, WithId } from "mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import {
  businessDateFor,
  lastBusinessDates,
  businessDateMinusDays,
  formatBusinessDateLabel,
} from "@/lib/businessDate";
import { getBusinessDaysByDates } from "@/lib/businessDays";
import { totalRevenueSen } from "@/lib/nightReport";
import NightReportScreen, {
  type DaySlot,
  type DaySummary,
} from "./night-report-screen";

// The report and cash count depend on request-time data; never prerender.
export const dynamic = "force-dynamic";

const RECEPTION_BACKFILL_DAYS = 7;

function summarize(doc: WithId<Document>): DaySummary {
  const roomRevenueSen: number = doc.rooms?.revenueSen ?? 0;
  const revenueLines: { amountSen: number }[] = doc.revenueLines ?? [];
  return {
    status: doc.status ?? "submitted",
    roomsSold: doc.rooms?.sold ?? 0,
    roomsAvailable: doc.rooms?.available ?? 0,
    totalRevenueSen: totalRevenueSen(roomRevenueSen, revenueLines),
    countedSen: doc.cash?.countedSen ?? 0,
    varianceSen: doc.cash?.varianceSen ?? 0,
    varianceReason: doc.cash?.varianceReason ?? "",
    revenueGapSen: doc.revenueGapSen ?? 0,
    revenueGapReason: doc.revenueGapReason ?? "",
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
  const dates = lastBusinessDates(current, RECEPTION_BACKFILL_DAYS);
  const previous = dates.at(-2) ?? current;

  const docs = await getBusinessDaysByDates(dates);
  const docByDate = new Map(docs.map((d) => [String(d.date), d]));

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
        summary: doc ? summarize(doc) : null,
      };
    });

  const minDate =
    user?.role === "owner"
      ? undefined
      : businessDateMinusDays(current, RECEPTION_BACKFILL_DAYS - 1);

  return (
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
    />
  );
}
