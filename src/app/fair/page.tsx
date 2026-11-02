import { Suspense } from "react";
import { FairPage } from "@/components/play/FairPage";

export const metadata = { title: "Проверка честности" };

export default function Page() {
  return <Suspense><FairPage /></Suspense>;
}
