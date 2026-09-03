import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { getCompanyDetails } from "@/lib/companyDetailsStore";
import LoginForm from "./login-form";

export default async function LoginPage() {
  // Already signed in? Skip the form.
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));

  const company = await getCompanyDetails();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div
        className="w-full max-w-sm rounded-card border p-6"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <h1
          className="mb-1"
          style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}
        >
          {company.tradingName || "Accounts"}
        </h1>
        <p
          className="mb-6"
          style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}
        >
          Sign in to the accounts system.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
