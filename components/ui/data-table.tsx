"use client";

import Card from "./card";

export interface DataTableColumn {
  key: string;
  header: string;
  align?: "left" | "right";
}

/**
 * A shell, not a fully declarative rows+render table. Real per-row
 * complexity across the app (Employees/Settings swap a row for an inline
 * edit form, Salary's cells are multi-line, OTA's rows expand into a
 * remittance form) would fight a generic column/row renderer rather than
 * be served by it. This owns exactly the white card container, header
 * row, generous padding, and empty state; each caller keeps writing its
 * own <tr> rows as children — add the `table-row-hover` class to each row
 * for the hover lift, and `.money` to money cells exactly as already done
 * everywhere in the app.
 */
export default function DataTable({
  columns,
  isEmpty,
  emptyMessage,
  emptyAction,
  flat = false,
  animate = false,
  delayMs = 0,
  className = "",
  children,
}: {
  columns: DataTableColumn[];
  isEmpty: boolean;
  emptyMessage: string;
  emptyAction?: React.ReactNode;
  flat?: boolean;
  animate?: boolean;
  delayMs?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      flat={flat}
      animate={animate}
      delayMs={delayMs}
      className={`overflow-hidden ${className}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: "var(--text-label)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-strong)", color: "var(--text-muted)" }}>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-3 ${c.align === "right" ? "text-right" : "text-left"}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <p style={{ color: "var(--text-muted)" }}>{emptyMessage}</p>
                    {emptyAction}
                  </div>
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
