"use server";

import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { formatRM } from "@/lib/money";
import {
  BookingInputSchema,
  BookingPaymentInputSchema,
  CancellationInputSchema,
  LetterConfigSchema,
  BOOKING_STATUSES,
  CANCELLATION_STATUSES,
  summarisePayments,
  type BookingStatus,
  type CancellationStatus,
  type PaymentType,
} from "@/lib/bookings";
import {
  ensureBookingIndexes,
  createBooking as createBookingDoc,
  updateBooking,
  setBookingStatus,
  cancelBooking as cancelBookingDoc,
  updateBookingLetterConfig,
  getBookingById,
} from "@/lib/bookingsStore";
import {
  ensureBookingPaymentIndexes,
  createBookingPayment,
  getPaymentsForBooking,
} from "@/lib/bookingPaymentsStore";
import {
  ensurePaymentMethodsIndexes,
  ensurePaymentMethodsSeeded,
  getPaymentMethods,
} from "@/lib/paymentMethodsStore";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CreateResult =
  | { ok: true; id: string; reference: string }
  | { ok: false; error: string };

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Please check the form.";
}

/** Create a booking. Any authenticated role (reception+, brief §5). */
export async function createBooking(input: unknown): Promise<CreateResult> {
  const user = await requireUser();
  const parsed = BookingInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await ensureBookingIndexes();
    const { id, reference } = await createBookingDoc(parsed.data, {
      id: user.sub,
      role: user.role,
    });
    return { ok: true, id, reference };
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      // Reference collision (two creates racing) — the sequence makes this all
      // but impossible, but report it rather than throw a 500.
      return {
        ok: false,
        error: "Couldn't allocate a booking reference — try again.",
      };
    }
    throw err;
  }
}

/** Edit a booking's details. Manager+ (reception can't edit — brief §5). */
export async function editBooking(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser("manager");
  const parsed = BookingInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const after = await updateBooking(id, parsed.data, {
    id: user.sub,
    role: user.role,
  });
  if (!after) return { ok: false, error: "That booking no longer exists." };
  return { ok: true };
}

/**
 * Change a booking's status — check in / out, cancel, no-show. Manager+: the
 * §5 table gives reception no booking mutation beyond create/pay/letter, and
 * cancel is explicitly manager+, so all status changes are gated the same way.
 */
export async function changeBookingStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  const user = await requireUser("manager");
  if (!BOOKING_STATUSES.includes(status as BookingStatus)) {
    return { ok: false, error: "Unknown status." };
  }
  // Cancelling / no-show goes through cancelBooking (reason + deposit
  // disposition are required) — never a bare status flip.
  if ((CANCELLATION_STATUSES as readonly string[]).includes(status)) {
    return {
      ok: false,
      error: "Use the cancel flow to cancel or mark a booking no-show.",
    };
  }
  const after = await setBookingStatus(id, status as BookingStatus, {
    id: user.sub,
    role: user.role,
  });
  if (!after) return { ok: false, error: "That booking no longer exists." };
  return { ok: true };
}

/**
 * Cancel a booking or mark it no-show. Manager+ (brief §5). Requires a reason
 * and the deposit disposition: `refundedSen` of the held deposit goes back
 * (a refund payment), the remainder is forfeited (becomes revenue). The held
 * amount is computed server-side from the booking's payments so the client
 * can't over-refund; a refund needs a valid, active payment method.
 */
export async function cancelBooking(input: unknown): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const parsed = CancellationInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const data = parsed.data;
  const bookingId = (input as { bookingId?: string })?.bookingId ?? "";
  if (!bookingId) return { ok: false, error: "Missing booking." };

  const user = await requireUser("manager");

  const booking = await getBookingById(bookingId);
  if (!booking) return { ok: false, error: "That booking no longer exists." };
  if (booking.status === "cancelled" || booking.status === "no_show") {
    return { ok: false, error: "This booking is already cancelled." };
  }

  // Deposit held = net of everything paid vs refunded so far.
  const payments = await getPaymentsForBooking(bookingId);
  const { netPaidSen: depositHeldSen } = summarisePayments(
    payments.map((p) => ({
      amountSen: Number(p.amountSen) || 0,
      type: p.type as PaymentType,
    })),
  );

  if (data.refundedSen > Math.max(0, depositHeldSen)) {
    return {
      ok: false,
      error: `Refund can't exceed the deposit held (${formatRM(Math.max(0, depositHeldSen))}).`,
    };
  }
  const forfeitedSen = Math.max(0, depositHeldSen) - data.refundedSen;

  if (data.refundedSen > 0) {
    await ensurePaymentMethodsIndexes();
    await ensurePaymentMethodsSeeded();
    const methods = await getPaymentMethods();
    const valid = new Set(
      methods.filter((m) => m.active).map((m) => m._id.toString()),
    );
    if (!valid.has(data.refundPaymentMethodId)) {
      return {
        ok: false,
        error: "Choose a valid payment method for the refund.",
      };
    }
  }

  const settings = await getSettings();
  const cancelledOn = businessDateFor(new Date(), settings.cutoffHour);

  const after = await cancelBookingDoc(
    bookingId,
    {
      status: data.status as CancellationStatus,
      reason: data.reason,
      cancelledOn,
      depositHeldSen: Math.max(0, depositHeldSen),
      refundedSen: data.refundedSen,
      forfeitedSen,
      refundPaymentMethodId: data.refundPaymentMethodId,
      refundReference: data.refundReference,
    },
    { id: user.sub, role: user.role },
  );
  if (!after) {
    return { ok: false, error: "That booking was already cancelled." };
  }
  return { ok: true };
}

/**
 * Record a payment against a booking. Recording a payment is reception+;
 * a REFUND is manager+ (brief §5). The payment method is re-validated against
 * the currently-active set at submit, same as expenses/revenue — the client's
 * list can go stale between page load and submit.
 */
export async function recordPayment(input: unknown): Promise<ActionResult> {
  const parsed = BookingPaymentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  // A refund needs manager+; any other payment type is reception+.
  const user =
    parsed.data.type === "refund"
      ? await requireUser("manager")
      : await requireUser();

  const booking = await getBookingById(parsed.data.bookingId);
  if (!booking) return { ok: false, error: "That booking no longer exists." };

  await ensurePaymentMethodsIndexes();
  await ensurePaymentMethodsSeeded();
  const methods = await getPaymentMethods();
  const valid = new Set(
    methods.filter((m) => m.active).map((m) => m._id.toString()),
  );
  if (!valid.has(parsed.data.paymentMethodId)) {
    return {
      ok: false,
      error: "That payment method isn't valid — refresh the page and try again.",
    };
  }

  await ensureBookingPaymentIndexes();
  await createBookingPayment(parsed.data, { id: user.sub, role: user.role });
  return { ok: true };
}

/**
 * Save the reservation-letter configuration used for a booking (brief §3 —
 * stored so a reprint matches, and "last used" becomes the default). Any
 * authenticated role may generate a letter (reception+).
 */
export async function saveLetterConfig(
  bookingId: string,
  config: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = LetterConfigSchema.safeParse(config);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await updateBookingLetterConfig(bookingId, parsed.data, {
      id: user.sub,
      role: user.role,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
