import { describe, it, expect } from "vitest";
import {
  nightsBetween,
  stayNightDates,
  roomLineTotals,
  bookingNightsFor,
  bookingTotals,
  summarisePayments,
  outstandingSen,
  formatBookingRef,
  tourismTaxDefaultApplies,
  BookingInputSchema,
  CancellationInputSchema,
  LetterConfigSchema,
  defaultLetterConfig,
  TOURISM_TAX_PER_ROOM_PER_NIGHT_SEN,
  type AccrualInput,
} from "./bookings";
import { countryName, isValidCountryCode, searchCountries } from "./countries";

describe("nightsBetween", () => {
  it("counts nights, not days — check-out day is not a night", () => {
    expect(nightsBetween("2026-09-01", "2026-09-04")).toBe(3);
  });
  it("crosses month and year boundaries", () => {
    expect(nightsBetween("2026-08-30", "2026-09-14")).toBe(15);
    expect(nightsBetween("2026-12-31", "2027-01-02")).toBe(2);
  });
  it("is 0 when check-out is not after check-in", () => {
    expect(nightsBetween("2026-09-04", "2026-09-04")).toBe(0);
    expect(nightsBetween("2026-09-04", "2026-09-01")).toBe(0);
  });
});

describe("stayNightDates", () => {
  it("lists each night from check-in up to (not including) check-out", () => {
    expect(stayNightDates("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
    ]);
  });
});

describe("roomLineTotals", () => {
  it("multiplies rooms × nights × rate", () => {
    const t = roomLineTotals({
      roomsCount: 3,
      ratePerNightSen: 8000,
      checkIn: "2026-09-01",
      checkOut: "2026-09-09", // 8 nights
    });
    expect(t.nights).toBe(8);
    expect(t.roomNights).toBe(24);
    expect(t.lineTotalSen).toBe(3 * 8 * 8000); // 192000
  });
});

// A single-room booking — the common case still behaves exactly as before.
const single: AccrualInput = {
  rooms: [
    { roomsCount: 1, ratePerNightSen: 8000, checkIn: "2026-08-30", checkOut: "2026-09-14" },
  ],
  tourismTaxApplicable: true,
  tourismTaxPerRoomPerNightSen: TOURISM_TAX_PER_ROOM_PER_NIGHT_SEN,
  status: "confirmed",
};

describe("bookingNightsFor — single room (common case)", () => {
  it("one row per night, RM 160 Aug / RM 1,040 Sep", () => {
    const nights = bookingNightsFor(single);
    expect(nights).toHaveLength(15);
    expect(nights.every((n) => n.roomsCount === 1)).toBe(true);
    const aug = nights.filter((n) => n.date.startsWith("2026-08")).reduce((s, n) => s + n.roomRevenueSen, 0);
    const sep = nights.filter((n) => n.date.startsWith("2026-09")).reduce((s, n) => s + n.roomRevenueSen, 0);
    expect(aug).toBe(16000);
    expect(sep).toBe(104000);
  });
  it("tourism tax is its own per-night figure, never in room revenue", () => {
    const nights = bookingNightsFor(single);
    expect(nights[0].roomRevenueSen).toBe(8000);
    expect(nights[0].tourismTaxSen).toBe(1000);
  });
});

describe("bookingNightsFor — multiple rooms", () => {
  it("sums room count, revenue and tax across lines on the same night", () => {
    const input: AccrualInput = {
      rooms: [
        { roomsCount: 2, ratePerNightSen: 8000, checkIn: "2026-09-01", checkOut: "2026-09-03" },
        { roomsCount: 1, ratePerNightSen: 12000, checkIn: "2026-09-01", checkOut: "2026-09-03" },
      ],
      tourismTaxApplicable: true,
      tourismTaxPerRoomPerNightSen: 1000,
      status: "confirmed",
    };
    const nights = bookingNightsFor(input);
    expect(nights).toHaveLength(2); // 09-01, 09-02
    expect(nights[0].roomsCount).toBe(3); // 2 + 1
    expect(nights[0].roomRevenueSen).toBe(2 * 8000 + 1 * 12000); // 28000
    expect(nights[0].tourismTaxSen).toBe(3 * 1000); // 3 rooms × RM 10
  });

  it("accrues correctly when one room leaves early (per-night, not whole-stay)", () => {
    // Room A: 4 nights (09-01..09-05). Room B leaves early: 2 nights (09-01..09-03).
    const input: AccrualInput = {
      rooms: [
        { roomsCount: 1, ratePerNightSen: 8000, checkIn: "2026-09-01", checkOut: "2026-09-05" },
        { roomsCount: 1, ratePerNightSen: 8000, checkIn: "2026-09-01", checkOut: "2026-09-03" },
      ],
      tourismTaxApplicable: true,
      tourismTaxPerRoomPerNightSen: 1000,
      status: "confirmed",
    };
    const nights = bookingNightsFor(input);
    const byDate = Object.fromEntries(nights.map((n) => [n.date, n]));
    expect(byDate["2026-09-01"].roomsCount).toBe(2);
    expect(byDate["2026-09-02"].roomsCount).toBe(2);
    expect(byDate["2026-09-03"].roomsCount).toBe(1); // room B has left
    expect(byDate["2026-09-04"].roomsCount).toBe(1);
    const totalRev = nights.reduce((s, n) => s + n.roomRevenueSen, 0);
    expect(totalRev).toBe(6 * 8000); // 6 room-nights total (4 + 2)
  });

  it("accrues nothing for cancelled or no-show", () => {
    expect(bookingNightsFor({ ...single, status: "cancelled" })).toEqual([]);
    expect(bookingNightsFor({ ...single, status: "no_show" })).toEqual([]);
  });
});

describe("bookingTotals", () => {
  it("single room matches the brief's RM 1,350 example", () => {
    const t = bookingTotals(single);
    expect(t.totalRooms).toBe(1);
    expect(t.roomNights).toBe(15);
    expect(t.roomRevenueSen).toBe(120000);
    expect(t.tourismTaxSen).toBe(15000);
    expect(t.grandTotalSen).toBe(135000);
  });

  it("tourism tax is total room-nights × rate: 3 rooms × 8 nights = RM 240", () => {
    const t = bookingTotals({
      rooms: [
        { roomsCount: 3, ratePerNightSen: 8000, checkIn: "2026-09-01", checkOut: "2026-09-09" },
      ],
      tourismTaxApplicable: true,
      tourismTaxPerRoomPerNightSen: 1000, // RM 10
      status: "confirmed",
    });
    expect(t.totalRooms).toBe(3);
    expect(t.roomNights).toBe(24);
    expect(t.tourismTaxSen).toBe(24000); // RM 240
  });

  it("sums across differently-priced lines and agrees with bookingNightsFor", () => {
    const input: AccrualInput = {
      rooms: [
        { roomsCount: 2, ratePerNightSen: 8000, checkIn: "2026-09-01", checkOut: "2026-09-04" }, // 6 room-nights
        { roomsCount: 1, ratePerNightSen: 15000, checkIn: "2026-09-01", checkOut: "2026-09-02" }, // 1 room-night
      ],
      tourismTaxApplicable: true,
      tourismTaxPerRoomPerNightSen: 1000,
      status: "confirmed",
    };
    const t = bookingTotals(input);
    expect(t.totalRooms).toBe(3);
    expect(t.roomNights).toBe(7);
    expect(t.tourismTaxSen).toBe(7000);
    const nightsRev = bookingNightsFor(input).reduce((s, n) => s + n.roomRevenueSen, 0);
    expect(nightsRev).toBe(t.roomRevenueSen);
  });

  it("cancelled: money zero, but totalRooms still reflects the rooms booked", () => {
    const t = bookingTotals({
      rooms: [
        { roomsCount: 3, ratePerNightSen: 8000, checkIn: "2026-09-01", checkOut: "2026-09-09" },
      ],
      tourismTaxApplicable: true,
      tourismTaxPerRoomPerNightSen: 1000,
      status: "cancelled",
    });
    expect(t.totalRooms).toBe(3);
    expect(t.roomNights).toBe(0);
    expect(t.roomRevenueSen).toBe(0);
    expect(t.grandTotalSen).toBe(0);
  });

  it("zeroes tourism tax when not applicable", () => {
    const t = bookingTotals({ ...single, tourismTaxApplicable: false });
    expect(t.tourismTaxSen).toBe(0);
    expect(t.roomRevenueSen).toBe(120000);
  });
});

describe("payments and outstanding balance", () => {
  it("a deposit reduces what's outstanding", () => {
    expect(outstandingSen(135000, [{ amountSen: 50000, type: "deposit" }])).toBe(85000);
  });
  it("separates paid from refunded", () => {
    const s = summarisePayments([
      { amountSen: 50000, type: "deposit" },
      { amountSen: 10000, type: "refund" },
    ]);
    expect(s.paidSen).toBe(50000);
    expect(s.refundedSen).toBe(10000);
    expect(s.netPaidSen).toBe(40000);
  });
  it("goes negative when the guest overpaid, rather than clamping", () => {
    expect(outstandingSen(135000, [{ amountSen: 140000, type: "full" }])).toBe(-5000);
  });
});

describe("formatBookingRef", () => {
  it("zero-pads to four digits with the year", () => {
    expect(formatBookingRef(2026, 1)).toBe("BK-2026-0001");
    expect(formatBookingRef(2026, 12345)).toBe("BK-2026-12345");
  });
});

describe("tourismTaxDefaultApplies", () => {
  it("is off for Malaysians, on for everyone else", () => {
    expect(tourismTaxDefaultApplies("MY")).toBe(false);
    expect(tourismTaxDefaultApplies("GB")).toBe(true);
    expect(tourismTaxDefaultApplies("SG")).toBe(true);
    expect(tourismTaxDefaultApplies("")).toBe(true);
  });
});

describe("countries", () => {
  it("validates and resolves codes", () => {
    expect(isValidCountryCode("MY")).toBe(true);
    expect(isValidCountryCode("ZZ")).toBe(false);
    expect(countryName("MY")).toBe("Malaysia");
    expect(countryName("Malaysian")).toBe("Malaysian"); // legacy fallback
  });
  it("puts Malaysia first when searching 'mal'", () => {
    expect(searchCountries("mal")[0].code).toBe("MY");
  });
});

describe("BookingInputSchema", () => {
  const good = {
    guestName: "Jane Traveller",
    guestIdNumber: "A1234567",
    nationality: "GB", // foreign → tourism tax default on
    checkIn: "2026-08-30",
    checkOut: "2026-09-14",
    rooms: [
      { roomType: "Twin", roomsCount: 1, ratePerNightSen: 8000, checkIn: "2026-08-30", checkOut: "2026-09-14" },
    ],
    tourismTaxApplicable: true,
    tourismTaxPerRoomPerNightSen: 1000,
    source: "direct_phone" as const,
  };

  it("accepts a well-formed single-room booking", () => {
    const parsed = BookingInputSchema.parse(good);
    expect(parsed.status).toBe("confirmed");
    expect(parsed.rooms).toHaveLength(1);
    expect(parsed.nationality).toBe("GB");
  });

  it("requires passport / IC", () => {
    expect(BookingInputSchema.safeParse({ ...good, guestIdNumber: "" }).success).toBe(false);
    expect(BookingInputSchema.safeParse({ ...good, guestIdNumber: "   " }).success).toBe(false);
  });

  it("requires a valid country code for nationality", () => {
    expect(BookingInputSchema.safeParse({ ...good, nationality: "Britain" }).success).toBe(false);
    expect(BookingInputSchema.safeParse({ ...good, nationality: "" }).success).toBe(false);
    // "MY" is a valid code; pair it with its default (tax off) so the override
    // refine doesn't confound this check.
    expect(
      BookingInputSchema.safeParse({ ...good, nationality: "MY", tourismTaxApplicable: false }).success,
    ).toBe(true);
  });

  it("Malaysian with tax on requires an override reason", () => {
    const base = { ...good, nationality: "MY" };
    // Default for Malaysian is OFF; turning it ON without a reason fails.
    expect(
      BookingInputSchema.safeParse({ ...base, tourismTaxApplicable: true }).success,
    ).toBe(false);
    // With a reason, it passes.
    expect(
      BookingInputSchema.safeParse({
        ...base,
        tourismTaxApplicable: true,
        tourismTaxOverrideReason: "Charged in error last month, recovering",
      }).success,
    ).toBe(true);
    // Matching the default (OFF) needs no reason.
    expect(
      BookingInputSchema.safeParse({ ...base, tourismTaxApplicable: false }).success,
    ).toBe(true);
  });

  it("foreign guest with tax off requires an override reason (e.g. permanent resident)", () => {
    expect(
      BookingInputSchema.safeParse({ ...good, tourismTaxApplicable: false }).success,
    ).toBe(false);
    expect(
      BookingInputSchema.safeParse({
        ...good,
        tourismTaxApplicable: false,
        tourismTaxOverrideReason: "Malaysian permanent resident",
      }).success,
    ).toBe(true);
  });

  it("accepts multiple room lines", () => {
    const parsed = BookingInputSchema.parse({
      ...good,
      rooms: [
        { roomsCount: 2, ratePerNightSen: 8000, checkIn: "2026-08-30", checkOut: "2026-09-02" },
        { roomsCount: 1, ratePerNightSen: 12000, checkIn: "2026-08-30", checkOut: "2026-08-31" },
      ],
    });
    expect(parsed.rooms).toHaveLength(2);
  });

  it("rejects a booking with no room lines", () => {
    expect(BookingInputSchema.safeParse({ ...good, rooms: [] }).success).toBe(false);
  });

  it("rejects a room line whose check-out is not after check-in", () => {
    expect(
      BookingInputSchema.safeParse({
        ...good,
        rooms: [{ roomsCount: 1, ratePerNightSen: 8000, checkIn: "2026-08-30", checkOut: "2026-08-30" }],
      }).success,
    ).toBe(false);
  });

  it("rejects zero rooms in a line", () => {
    expect(
      BookingInputSchema.safeParse({
        ...good,
        rooms: [{ roomsCount: 0, ratePerNightSen: 8000, checkIn: "2026-08-30", checkOut: "2026-09-14" }],
      }).success,
    ).toBe(false);
  });
});

describe("CancellationInputSchema", () => {
  it("requires a reason and a cancellation status", () => {
    expect(
      CancellationInputSchema.safeParse({ status: "cancelled", reason: "Guest changed plans" }).success,
    ).toBe(true);
    expect(CancellationInputSchema.safeParse({ status: "cancelled", reason: "" }).success).toBe(false);
    expect(CancellationInputSchema.safeParse({ status: "cancelled", reason: "   " }).success).toBe(false);
    // Only cancelled / no_show are cancellation statuses.
    expect(CancellationInputSchema.safeParse({ status: "checked_out", reason: "x" }).success).toBe(false);
  });
  it("defaults the refund fields to empty / zero", () => {
    const p = CancellationInputSchema.parse({ status: "no_show", reason: "Did not arrive" });
    expect(p.refundedSen).toBe(0);
    expect(p.refundPaymentMethodId).toBe("");
  });
  it("rejects a negative refund", () => {
    expect(
      CancellationInputSchema.safeParse({ status: "cancelled", reason: "x", refundedSen: -1 }).success,
    ).toBe(false);
  });
});

describe("LetterConfigSchema / defaultLetterConfig", () => {
  it("defaults to every clause included and the standard fields shown", () => {
    const c = defaultLetterConfig();
    expect(c.clauseKeys.length).toBeGreaterThan(0);
    expect(c.show.nationality).toBe(true);
    expect(LetterConfigSchema.safeParse(c).success).toBe(true);
  });
});
