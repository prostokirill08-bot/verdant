import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Неверный email").max(254);
export const usernameSchema = z.string().trim().min(3, "Ник — от 3 символов").max(20, "Ник — до 20 символов")
  .regex(/^[a-zA-Z0-9_]+$/, "Ник: латиница, цифры и _");
export const passwordSchema = z.string().min(8, "Пароль — от 8 символов").max(128)
  .refine((p) => /[a-zA-Zа-яА-Я]/.test(p) && /\d/.test(p), "Пароль должен содержать буквы и цифры");

export const registerSchema = z.object({ email: emailSchema, username: usernameSchema, password: passwordSchema, adult: z.literal(true, { errorMap: () => ({ message: "Подтверди, что тебе есть 18 лет" }) }) });
export const loginSchema = z.object({ login: z.string().trim().min(1, "Введи email или ник").max(254), password: z.string().min(1, "Введи пароль").max(128) });
export const forgotSchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ token: z.string().min(20).max(100), password: passwordSchema });
