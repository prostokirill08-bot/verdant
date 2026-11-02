import { forwardRef, useId } from "react";

export const Field = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; suffix?: React.ReactNode }>(
  function Field({ label, hint, error, suffix, className = "", id, ...rest }, ref) {
    const auto = useId(); const fid = id ?? auto;
    return (
      <label htmlFor={fid} className={`grid gap-1.5 ${className}`}>
        <span className="text-[12px] font-medium uppercase tracking-wider text-muted">{label}</span>
        <span className={`flex items-center rounded-xl border bg-ink transition-colors focus-within:border-accent ${error ? "border-danger" : "border-line"}`}>
          <input ref={ref} id={fid} {...rest} aria-invalid={!!error}
            className="h-11 w-full min-w-0 bg-transparent px-3.5 text-[15px] text-white placeholder:text-muted/70 outline-none tabular" />
          {suffix && <span className="pr-2">{suffix}</span>}
        </span>
        {(error || hint) && <span className={`text-[12.5px] ${error ? "text-danger" : "text-muted"}`}>{error || hint}</span>}
      </label>
    );
  });
