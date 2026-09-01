import type { Document } from "mongodb";
import { getSettings } from "@/lib/settings";
import { businessDateFor, previousBusinessDate } from "@/lib/businessDate";
import { getBusinessDay } from "@/lib/businessDays";
import { totalRevenueSen } from "@/lib/nightReport";
import NightReportScreen, {
  type DaySlot,
  type DaySummary,
} from "./night-report-screen";

// The report and cash count depend on request-time data; never prerender.
export const dynamic = "force-dynamic";

function summarize(doc: Document): DaySummary {
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
  const settings = await getSettings();
  const current = businessDateFor(new Date(), settings.cutoffHour);
  const previous = previousBusinessDate(current);

  const [currentDoc, previousDoc] = await Promise.all([
    getBusinessDay(current),
    getBusinessDay(previous),
  ]);

  const slots: DaySlot[] = [
    {
      date: current,
      label: `Tonight — ${current}`,
      summary: currentDoc ? summarize(currentDoc) : null,
    },
    {
      date: previous,
      label: `Yesterday — ${previous}`,
      summary: previousDoc ? summarize(previousDoc) : null,
    },
  ];

  return (
    <NightReportScreen
      slots={slots}
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
