import { getCompanyDetails } from "@/lib/companyDetailsStore";
import PageHeader from "@/components/ui/page-header";
import CompanyForm from "./company-form";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const company = await getCompanyDetails();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Company details"
        description="One place for everything about the business. Read by every document the system generates — the booking confirmation today; invoices, receipts, payslips and reports as they're built. Nothing here is hardcoded anywhere else."
        animate
      />
      <CompanyForm initial={company} />
    </div>
  );
}
