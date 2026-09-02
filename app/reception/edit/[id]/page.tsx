import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getBusinessDayById } from "@/lib/businessDays";
import { getActiveCategories } from "@/lib/categoriesStore";
import { getActiveOtaPlatforms } from "@/lib/otaPlatformsStore";
import { PAID_BY } from "@/lib/nightReport";
import NightReportEditor, { type EditorInitial } from "../../night-report-editor";

// Owner/manager pre-approval edit of a submitted report. Depends on request-time
// data; never prerender.
export const dynamic = "force-dynamic";

type PaidBy = (typeof PAID_BY)[number];

export default async function EditReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Reception raises a correction request instead — this route is manager+.
  // The reception layout only gates "any authenticated"; this is the real gate.
  await requireUser("manager");

  const { id } = await params;
  const day = await getBusinessDayById(id);
  if (!day) notFound();

  // Only a still-submitted day can be edited. Once approved it's locked
  // (CLAUDE.md rule 5) — show why rather than an editable form.
  if (day.status !== "submitted") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
          Can&apos;t edit {String(day.date)}
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          This report is {String(day.status)} and can no longer be edited. Approved days
          are immutable — corrections are recorded separately.
        </p>
        <Link href="/reception" style={{ color: "var(--brand)" }}>
          ← Back to Front desk
        </Link>
      </div>
    );
  }

  const [settings, revCats, expCats, otaPlatforms] = await Promise.all([
    getSettings(),
    getActiveCategories("revenue"),
    getActiveCategories("expense"),
    getActiveOtaPlatforms(),
  ]);
  const revenueCategoryNames = revCats.filter((c) => !c.standaloneOnly).map((c) => c.name);
  const expenseCategoryNames = expCats.filter((c) => !c.standaloneOnly).map((c) => c.name);

  const c = day.collections ?? {};
  type OtaBooking = { platformId: string; bookingsCount: number; roomRevenueSen: number; guestPaidPlatform: boolean };
  const rawOtaBookings = (day.otaBookings ?? []) as OtaBooking[];
  // A report submitted before this feature shipped may still be sitting
  // "submitted" (unapproved) with the old aggregate field and no
  // otaBookings array at all — bridge it into one prefilled line so the
  // figure isn't silently dropped. platformId is left blank on purpose:
  // the schema requires a real platform to save, so the manager must pick
  // one (or delete the line) before this edit can be saved. Nothing is
  // written to the database until they do.
  const otaBookings: OtaBooking[] =
    rawOtaBookings.length === 0 && (c.otaPrepaidSen ?? 0) > 0
      ? [{ platformId: "", bookingsCount: 1, roomRevenueSen: c.otaPrepaidSen, guestPaidPlatform: true }]
      : rawOtaBookings;
  const initial: EditorInitial = {
    rooms: {
      available: day.rooms?.available ?? 0,
      sold: day.rooms?.sold ?? 0,
      houseUse: day.rooms?.houseUse ?? 0,
      revenueSen: day.rooms?.revenueSen ?? 0,
      reportPhotoUrl: day.rooms?.reportPhotoUrl ?? "",
    },
    revenueLines: (day.revenueLines ?? []).map((l: { category: string; amountSen: number; note?: string }) => ({
      category: l.category, amountSen: l.amountSen, note: l.note ?? "",
    })),
    otaBookings,
    collections: {
      cashSen: c.cashSen ?? 0, cardSen: c.cardSen ?? 0, transferSen: c.transferSen ?? 0,
      ewalletSen: c.ewalletSen ?? 0,
      chargeToAccountSen: c.chargeToAccountSen ?? 0, depositsSen: c.depositsSen ?? 0,
      refundsSen: c.refundsSen ?? 0, receivablesSettledSen: c.receivablesSettledSen ?? 0,
    },
    expenses: (day.expenses ?? []).map((e: { category: string; amountSen: number; paidTo?: string; paidBy: PaidBy; note?: string; receiptUrl?: string }) => ({
      category: e.category, amountSen: e.amountSen, paidTo: e.paidTo ?? "",
      paidBy: e.paidBy, note: e.note ?? "", receiptUrl: e.receiptUrl ?? "",
    })),
    cash: {
      openingFloatSen: day.cash?.openingFloatSen ?? 0,
      bankedInSen: day.cash?.bankedInSen ?? 0,
      countedSen: day.cash?.countedSen ?? 0,
    },
    remarks: day.remarks ?? "",
    varianceReason: day.cash?.varianceReason ?? "",
    revenueGapReason: day.revenueGapReason ?? "",
  };

  return (
    <NightReportEditor
      id={id}
      date={String(day.date)}
      initial={initial}
      varianceThresholdSen={settings.varianceThresholdSen}
      revenueGapThresholdSen={settings.revenueGapThresholdSen}
      expenseCeilingSen={settings.expenseCeilingSen}
      revenueCategoryNames={revenueCategoryNames}
      expenseCategoryNames={expenseCategoryNames}
      otaPlatforms={otaPlatforms.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        guestPaysPlatform: p.guestPaysPlatform,
      }))}
    />
  );
}
