/**
 * Company details — the single source of truth for everything about the
 * business: identity, contact, tax registrations, logo and bank details.
 * Read by every document the system generates (the booking confirmation today;
 * invoices, receipts, payslips and reports as they're built). Nothing about the
 * company's identity is hardcoded in a component — it all comes from here.
 *
 * Pure module (schema + defaults, no database import) so it's safe to import
 * from a client component. DB access lives in lib/companyDetailsStore.ts.
 *
 * There is one company, so it's a single settings document (not a collection),
 * same shape as propertySettings.
 */

import { z } from "zod";

const trimmed = (max: number) => z.string().trim().max(max).default("");

export const CompanyDetailsSchema = z.object({
  /** The public-facing name shown on documents. */
  tradingName: trimmed(160),
  /** The registered legal entity — appears on legal documents. */
  legalName: trimmed(160),
  /** SSM (Companies Commission) registration number. */
  ssmNumber: trimmed(60),
  /** Multi-line address (newlines preserved for display). */
  address: z.string().trim().max(600).default(""),
  phone: trimmed(60),
  email: trimmed(160),
  website: trimmed(200),
  /** Tax identification number, for e-Invoice. */
  tin: trimmed(60),
  /** SST registration number, where registered. */
  sstNumber: trimmed(60),
  /** Tourism tax registration number, where registered. */
  tourismTaxNumber: trimmed(60),
  /** Logo URL — a pasted link for now, consistent with how photos/receipts are
   * handled elsewhere (no upload/storage mechanism yet). */
  logoUrl: trimmed(500),
  /** Bank details for payment instructions on documents. */
  bankName: trimmed(120),
  bankAccountName: trimmed(160),
  bankAccountNumber: trimmed(60),
});

export type CompanyDetails = z.infer<typeof CompanyDetailsSchema>;

/**
 * The seeded starting values (from the business). Returned until the owner
 * saves the form, after which the stored document is authoritative — including
 * any fields the owner deliberately blanks.
 */
export const DEFAULT_COMPANY_DETAILS: CompanyDetails = {
  tradingName: "Hotel Bintang Kuala Lumpur",
  legalName: "Hotel Bintang KL Sdn Bhd",
  ssmNumber: "1539521-M",
  address:
    "394, Jln Pudu, Pudu, 55100 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur",
  phone: "+60 18-240 9999",
  email: "admin.hotelbintang@gmail.com",
  website: "",
  tin: "",
  sstNumber: "",
  tourismTaxNumber: "",
  logoUrl: "",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
};
