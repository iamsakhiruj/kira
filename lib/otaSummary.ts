/**
 * Pure aggregation functions for the /ota page (OTA platform tracking).
 * NO database imports — takes already-fetched plain objects, same split as
 * `lib/reportSummary.ts`.
 *
 * Two different scopes, by design (confirmed with the user):
 *  - otaBookingsSummary() is scoped to whatever date range the caller
 *    passes in (a period metric, like every number on /reports).
 *  - otaPlatformBalances() is an all-time running balance, independent of
 *    any date range — same precedent as getPartnerBalances() in
 *    lib/partnersStore.ts. The caller is responsible for passing it
 *    all-history data (lib/businessDays.ts's
 *    getAllBusinessDaysWithOtaBookings() + lib/otaRemittancesStore.ts's
 *    getAllOtaRemittances()), not a date-ranged slice.
 */

interface OtaBookingLine {
  platformId: string;
  bookingsCount: number;
  roomRevenueSen: number;
  guestPaidPlatform: boolean;
}

interface NightDayWithOtaBookings {
  otaBookings: OtaBookingLine[];
}

interface RemittanceAmounts {
  platformId: string;
  amountReceivedSen: number;
  outstandingCoveredSen: number;
}

// ---------------------------------------------------------------------------
// Bookings summary — date-range scoped
// ---------------------------------------------------------------------------

export interface OtaBookingsSummaryRow {
  platformId: string;
  bookingsCount: number;
  revenueBookedSen: number;
}

/** Bookings and revenue booked per platform, over whatever night days the
 * caller passes in (typically getBusinessDaysBetween(from, to)). Revenue
 * booked includes every line regardless of who paid — it's "how much
 * business went through this platform," not the receivable portion. */
export function otaBookingsSummary(
  nightDays: NightDayWithOtaBookings[],
): OtaBookingsSummaryRow[] {
  const map = new Map<string, OtaBookingsSummaryRow>();
  for (const day of nightDays) {
    for (const line of day.otaBookings) {
      const row = map.get(line.platformId) ?? {
        platformId: line.platformId,
        bookingsCount: 0,
        revenueBookedSen: 0,
      };
      row.bookingsCount += line.bookingsCount;
      row.revenueBookedSen += line.roomRevenueSen;
      map.set(line.platformId, row);
    }
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Platform balances — all-time running balance
// ---------------------------------------------------------------------------

export interface OtaPlatformBalance {
  platformId: string;
  receivableAddedSen: number; // all-time, guest-paid-platform lines only
  receivedSen: number;
  outstandingSen: number;
}

/** Per-platform balance: outstanding = all-time receivable added − all-time
 * outstanding covered by remittances. received = all-time amount actually
 * banked. Not scoped to any date range — this is the true current balance,
 * same as a partner's balance. */
export function otaPlatformBalances(
  allNightDays: NightDayWithOtaBookings[],
  allRemittances: RemittanceAmounts[],
): Map<string, OtaPlatformBalance> {
  const receivableByPlatform = new Map<string, number>();
  for (const day of allNightDays) {
    for (const line of day.otaBookings) {
      if (!line.guestPaidPlatform) continue;
      receivableByPlatform.set(
        line.platformId,
        (receivableByPlatform.get(line.platformId) ?? 0) + line.roomRevenueSen,
      );
    }
  }

  const receivedByPlatform = new Map<string, number>();
  const coveredByPlatform = new Map<string, number>();
  for (const r of allRemittances) {
    receivedByPlatform.set(
      r.platformId,
      (receivedByPlatform.get(r.platformId) ?? 0) + r.amountReceivedSen,
    );
    coveredByPlatform.set(
      r.platformId,
      (coveredByPlatform.get(r.platformId) ?? 0) + r.outstandingCoveredSen,
    );
  }

  const platformIds = new Set([
    ...receivableByPlatform.keys(),
    ...receivedByPlatform.keys(),
    ...coveredByPlatform.keys(),
  ]);

  const result = new Map<string, OtaPlatformBalance>();
  for (const platformId of platformIds) {
    const receivableAddedSen = receivableByPlatform.get(platformId) ?? 0;
    const receivedSen = receivedByPlatform.get(platformId) ?? 0;
    const coveredSen = coveredByPlatform.get(platformId) ?? 0;
    result.set(platformId, {
      platformId,
      receivableAddedSen,
      receivedSen,
      outstandingSen: receivableAddedSen - coveredSen,
    });
  }
  return result;
}

/** How much of a remittance's covered amount is unexplained by cash
 * received — the commission-shortfall prompt in app/ota/ota-client.tsx.
 * Never negative: an overpayment isn't a negative commission. */
export function commissionShortfallSen(
  outstandingCoveredSen: number,
  amountReceivedSen: number,
): number {
  return Math.max(0, outstandingCoveredSen - amountReceivedSen);
}
