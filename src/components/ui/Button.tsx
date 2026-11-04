import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const styles: Record<Variant, string> = {
  // Лаймовый акцент новой темы
  primary: "bg-[linear-gradient(135deg,#a7f66b,#6cc837)] text-[#0a1608] hover:brightness-110 shadow-[0_8px_26px_-12px_#8bea4e,inset_0_-3px_0_rgb(0_0_0/0.15),inset_0_1px_0_rgb(255_255_255/0.35)]",
  secondary: "bg-raised text-white hover:bg-[#25305e]",
  ghost: "bg-transparent text-soft hover:text-white hover:bg-raised",
  danger: "bg-danger/15 text-danger hover:bg-danger/25",
};

export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }>(
  function Button({ variant = "primary", size = "md", loading, className = "", children, disabled, ...rest }, ref) {
    const sz = size === "sm" ? "h-8 px-3 text-[13px]" : size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-4 text-sm";
    return (
      <button ref={ref} disabled={disabled || loading} {...rest}
        className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${sz} ${styles[variant]} ${className}`}>
        {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
        {children}
      </button>
    );
  });
