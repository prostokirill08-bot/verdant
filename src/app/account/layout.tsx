import { RequireAuth } from "@/components/auth/RequireAuth";
import { AccountNav } from "@/components/account/AccountNav";

export const metadata = { title: "Кабинет" };
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth><div className="grid gap-6"><AccountNav />{children}</div></RequireAuth>;
}
