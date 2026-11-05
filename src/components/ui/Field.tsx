import { forwardRef, useId } from "react";

export const Field = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; suffix?: React.ReactNode }>(
  function Field({ label, hint, error, suffix, className = "", id, ...rest }, ref) {
    const auto = useId(); const fid = id ?? auto;
    return (
      <label htmlFor={fid} className={`grid gap-1.5 ${className}`}>
        <span className="text-[12px] font-medium uppercase tracking-wider text-muted">{label}</span>
        <span className={`flex items-center rounded-xl border bg-[#0a1221]/90 shadow-[inset_0_2px_8px_rgb(0_0_0/.22),0_1px_0_rgb(255_255_255/.035)] transition-colors focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgb(86_227_160/.10)] ${error ? "border-danger" : "border-line"}`}>
          <input ref={ref} id={fid} {...rest} aria-invalid={!!error}
            className="h-11 w-full min-w-0 bg-transparent px-3.5 text-[15px] text-white placeholder:text-muted/70 outline-none tabular" />
          {suffix && <span className="pr-2">{suffix}</span>}
        </span>
        {(error || hint) && <span className={`text-[12.5px] ${error ? "text-danger" : "text-muted"}`}>{error || hint}</span>}
      </label>
    );
  });
