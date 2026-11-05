"use client";
import { motion } from "framer-motion";

/** Плавный переход между страницами: короткое появление (только прозрачность — не мешает играм и не грузит телефон). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, ease: "easeOut" }}>{children}</motion.div>;
}
