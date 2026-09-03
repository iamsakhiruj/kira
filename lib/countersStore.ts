/**
 * Atomic named sequences, for gapless reference numbers (booking references,
 * and later invoice numbers). One document per sequence: `{ _id: name, seq }`.
 *
 * Gaplessness comes from allocating the number inside the SAME transaction as
 * the document that consumes it — pass the session through here, and a
 * rolled-back transaction rolls back the `$inc` too, so no number is ever
 * burned by a failed insert. `findOneAndUpdate` with `$inc` is itself atomic,
 * so two concurrent callers never receive the same value.
 *
 * Node runtime only (imports mongodb).
 */

import type { ClientSession, Collection, Document } from "mongodb";
import { getDb } from "./mongodb";

async function collection(): Promise<Collection<Document>> {
  return (await getDb()).collection("counters");
}

/**
 * Increment the named sequence and return its new value (1 on first use).
 * Pass a session to run inside a transaction — required for the gapless
 * guarantee when the consuming insert is transactional.
 */
export async function nextSequence(
  name: string,
  session?: ClientSession,
): Promise<number> {
  const col = await collection();
  const res = await col.findOneAndUpdate(
    { _id: name as unknown as never },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", session },
  );
  return (res as { seq: number } | null)?.seq ?? 1;
}
