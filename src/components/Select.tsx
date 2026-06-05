import { type ReactNode, useEffect, useRef, useState } from "react";
import { IconChevronDown } from "./icons";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Custom inline trigger (e.g. composer). When set, field styling is skipped. */
  trigger?: ReactNode;
  className?: string;
  align?: "left" | "right";
  openUp?: boolean;
}

export function Select({
  value,
  options,
  onChange,
  placeholder = "Выбрать...",
  trigger,
  className = "",
  align = "left",
  openUp = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${trigger ? "inline-flex" : ""}`}>
      {trigger ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center"
        >
          {trigger}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-2.5 py-1.5 text-left text-[12.5px] text-white transition-colors hover:border-[var(--color-faint)] ${className}`}
        >
          <span className={`truncate ${current ? "" : "text-[var(--color-faint)]"}`}>
            {current?.label ?? placeholder}
          </span>
          <IconChevronDown
            className={`h-3 w-3 flex-shrink-0 text-[var(--color-faint)] transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      )}

      {open && (
        <div
          className={`no-scrollbar absolute z-50 max-h-[300px] overflow-y-auto rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1 shadow-2xl ${
            openUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
          } ${align === "right" ? "right-0" : "left-0"} ${
            trigger ? "min-w-[230px]" : "w-full"
          }`}
        >
          {options.length === 0 ? (
            <div className="px-2.5 py-2 text-[12px] text-[var(--color-faint)]">
              Нет вариантов
            </div>
          ) : (
            options.map((o) => {
              const selected = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                    selected
                      ? "bg-[var(--color-surface-3)] text-white"
                      : "text-[#d6d6d6] hover:bg-[var(--color-surface-2)]"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.hint && (
                    <span className="truncate text-[11px] text-[var(--color-faint)]">
                      {o.hint}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
