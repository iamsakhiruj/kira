import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getBusinessDay } from "@/lib/businessDays";
import { getExpensesBetween } from "@/lib/expensesStore";
import { getAllCategories } from "@/lib/categoriesStore";
import { getPaymentMethods } from "@/lib/paymentMethodsStore";
import { getOtaPlatforms } from "@/lib/otaPlatformsStore";
import { csvRow as row } from "@/lib/csv";
import { fromSen } from "@/lib/money";
import { buildRevenueDetail, buildExpenseDetail, type RawNightDay } from "@/lib/dailyBreakdown";

export const dynamic = "force-dynamic";

function toRawNightDay(doc: Record<string, unknown>): RawNightDay {
  const rooms = (doc.rooms as RawNightDay["rooms"]) ?? {
    available: 0, sold: 0, houseUse: 0, revenueSen: 0,
  };
  const revenueLines = (doc.revenueLines as RawNightDay["revenueLines"]) ?? [];
  const otaBookings = (doc.otaBookings as RawNightDay["otaBookings"]) ?? [];
  const expenses = (doc.expenses as RawNightDay["expenses"]) ?? [];
  const collections = (doc.collections as RawNightDay["collections"]) ?? {
    cashSen: 0, cardSen: 0, transferSen: 0, ewalletSen: 0,
    chargeToAccountSen: 0, depositsSen: 0, refundsSen: 0, receivablesSettledSen: 0,
  };
  return {
    id: String(doc._id),
    date: String(doc.date),
    status: (doc.status as RawNightDay["status"]) ?? "submitted",
    rooms,
    revenueLines,
    otaBookings,
    collections,
    expenses,
    varianceSen: typeof doc.varianceSen === "number" ? doc.varianceSen : undefined,
    submittedBy: typeof doc.submittedBy === "string" ? doc.submittedBy : null,
    approvedBy: typeof doc.approvedBy === "string" ? doc.approvedBy : null,
    enteredLate: !!doc.enteredLate,
  };
}

// Per-day CSV export — manager+ only, same tier as the whole-table daily
// export and the whole-range summary export (reception gets no CSV export
// anywhere on /reports).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAuthorized(user.role, "manager")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const date = req.nextUrl.searchParams.get("date");
  const tab = req.nextUrl.searchParams.get("tab");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new NextResponse("Invalid or missing date.", { status: 400 });
  }
  if (tab !== "revenue" && tab !== "expenses") {
    return new NextResponse("tab must be 'revenue' or 'expenses'.", { status: 400 });
  }

  const [dayDoc, expensesForDate, revCats, expCats, paymentMethods, otaPlatforms] =
    await Promise.all([
      getBusinessDay(date),
      getExpensesBetween(date, date),
      getAllCategories("revenue"),
      getAllCategories("expense"),
      getPaymentMethods(),
      getOtaPlatforms(),
    ]);

  const day = dayDoc ? toRawNightDay(dayDoc as Record<string, unknown>) : null;
  let csv = "";

  if (tab === "revenue") {
    if (!day) {
      csv += row("Date", date);
      csv += row("", "No night report for this date.");
    } else {
      const platformNameById = new Map(otaPlatforms.map((p) => [p._id.toString(), p.name]));
      const detail = buildRevenueDetail(day, platformNameById);
      csv += row("Date", date);
      csv += row("Room revenue — direct", fromSen(detail.roomRevenueDirectSen));
      csv += row("Room revenue — OTA", fromSen(detail.roomRevenueOtaSen));
      csv += row("", "");
      csv += row("Revenue line", "Note", "Amount (RM)");
      for (const l of detail.revenueLines) {
        csv += row(l.category, l.note ?? "", fromSen(l.amountSen));
      }
      csv += row("", "");
      csv += row("Collection", "Amount (RM)");
      for (const c of detail.collections) {
        csv += row(c.label, fromSen(c.amountSen));
      }
      csv += row("", "");
      csv += row("OTA platform", "Bookings", "Room revenue (RM)", "Guest paid");
      for (const b of detail.otaBookings) {
        csv += row(
          b.platformName,
          String(b.bookingsCount),
          fromSen(b.roomRevenueSen),
          b.guestPaidPlatform ? "Platform" : "Us",
        );
      }
      csv += row("", "");
      csv += row("Total revenue", fromSen(detail.totalSen));
    }
  } else {
    const categoryNameById = new Map(
      [...revCats, ...expCats].map((c) => [c._id.toString(), c.name]),
    );
    const paymentMethodNameById = new Map(paymentMethods.map((m) => [m._id.toString(), m.name]));
    const standaloneForDate = expensesForDate
      .filter((e) => e.linkedBusinessDayId === null)
      .map((e) => ({
        categoryId: e.categoryId,
        amountSen: e.amountSen,
        paymentMethodId: e.paymentMethodId,
        paidTo: e.paidTo,
        linkedBusinessDayId: e.linkedBusinessDayId,
      }));
    const detail = buildExpenseDetail(
      day?.expenses ?? [],
      standaloneForDate,
      categoryNameById,
      paymentMethodNameById,
    );
    csv += row("Date", date);
    csv += row("Category", "Payment method", "Paid to", "Amount (RM)", "Source");
    for (const l of detail.lines) {
      csv += row(l.category, l.paymentMethodLabel, l.paidTo, fromSen(l.amountSen), l.source);
    }
    csv += row("", "");
    csv += row("Total expenses", fromSen(detail.totalSen));
  }

  const filename = `${date}-${tab}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
