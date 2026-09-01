import {
  ensureCategoriesIndexes,
  ensureCategoriesSeeded,
  getAllCategories,
} from "@/lib/categoriesStore";
import CategoriesManager from "./categories-manager";

// Reads the current lists on every request; cheap, and avoids a stale list
// after an edit.
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await ensureCategoriesIndexes();
  await ensureCategoriesSeeded();
  const [revenue, expense] = await Promise.all([
    getAllCategories("revenue"),
    getAllCategories("expense"),
  ]);

  const toRow = (c: (typeof revenue)[number]) => ({
    id: c._id.toString(),
    name: c.name,
    type: c.type,
    standaloneOnly: c.standaloneOnly,
    active: c.active,
    displayOrder: c.displayOrder,
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
          Categories
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Used on the night report and on the standalone revenue/expense
          screens. Deactivate a category instead of deleting it — anything
          already recorded against it keeps working. &ldquo;Standalone
          only&rdquo; expense categories (rent, salaries, and the like) never
          appear on the night report&apos;s own picker.
        </p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
          Revenue categories
        </h2>
        <CategoriesManager type="revenue" categories={revenue.map(toRow)} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
          Expense categories
        </h2>
        <CategoriesManager type="expense" categories={expense.map(toRow)} />
      </section>
    </div>
  );
}
