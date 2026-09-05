import { type NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getExpenseById, getOrAssignVoucherNumber } from "@/lib/expensesStore";
import { getAllCategories } from "@/lib/categoriesStore";
import { getPaymentMethods } from "@/lib/paymentMethodsStore";
import { getUserNamesByIds } from "@/lib/users";
import { getCompanyDetails } from "@/lib/companyDetailsStore";
import ExpenseVoucherPdf from "@/lib/pdf/expenseVoucherDocument";

export const dynamic = "force-dynamic";

const KL_DATETIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Voucher generation is manager+, same tier as /expenses itself.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAuthorized(user.role, "manager")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const expense = await getExpenseById(id);
  if (!expense || expense.deleted) return new NextResponse("Not found", { status: 404 });

  const [voucherNumber, categories, paymentMethods, company, userNameById] = await Promise.all([
    getOrAssignVoucherNumber(id, { id: user.sub, role: user.role }),
    getAllCategories("expense"),
    getPaymentMethods(),
    getCompanyDetails(),
    getUserNamesByIds([expense.paidBy]),
  ]);

  const categoryName = categories.find((c) => c._id.toString() === expense.categoryId)?.name ?? "—";
  const paymentMethodName = paymentMethods.find((m) => m._id.toString() === expense.paymentMethodId)?.name ?? "—";
  const preparedByName = userNameById.get(expense.paidBy) ?? "—";

  const buffer = await renderToBuffer(
    ExpenseVoucherPdf({
      company,
      voucherNumber,
      generatedAtLabel: `${KL_DATETIME.format(new Date())} (KL time)`,
      generatedByName: user.name,
      date: expense.date,
      paidTo: expense.paidTo,
      amountSen: expense.amountSen,
      categoryName,
      paymentMethodName,
      reference: expense.reference,
      description: expense.note,
      preparedByName,
      receiptUrl: expense.receiptUrl ?? "",
    }),
  );

  const filename = `${voucherNumber}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
