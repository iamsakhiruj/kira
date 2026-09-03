"use client";

import { useEffect, useId, useRef, useState } from "react";
import { countryName, searchCountries } from "@/lib/countries";

/**
 * Searchable country combobox. Stores the ISO 3166-1 code (via onChange),
 * shows the display name. Typing filters by name substring — "mal" surfaces
 * Malaysia first (it's pinned to the top of the list). Keyboard: arrows to
 * move, Enter to select, Escape to close.
 */
const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

export default function CountrySelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const results = open ? searchCountries(query) : [];

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function select(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
    setHighlight(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[highlight]) select(results[highlight].code);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  const displayValue = open ? query : value ? countryName(value) : "";

  return (
    <div ref={wrapRef} className="relative">
      <input
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        value={displayValue}
        placeholder="Search country…"
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHighlight(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded border px-3"
        style={fieldStyle}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded border"
          style={{ ...fieldStyle, boxShadow: "0 6px 20px rgba(0,0,0,0.12)" }}
        >
          {results.length === 0 ? (
            <li
              className="px-3 py-2"
              style={{ color: "var(--text-muted)", fontSize: "var(--text-label)" }}
            >
              No match
            </li>
          ) : (
            results.map((c, i) => (
              <li key={c.code}>
                <button
                  type="button"
                  // onMouseDown (not onClick) so the input's blur doesn't fire
                  // first and close the list before the selection registers.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(c.code);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left"
                  style={{
                    background: i === highlight ? "var(--brand-tint)" : "transparent",
                    fontSize: "var(--text-label)",
                  }}
                >
                  <span>{c.name}</span>
                  <span style={{ color: "var(--text-faint)", fontSize: "var(--text-caption)" }}>
                    {c.code}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
