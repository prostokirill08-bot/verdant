/**
 * Изолированный интерфейс платежей — ЗАГОТОВКА, НЕ РЕАЛИЗАЦИЯ.
 *
 * Сейчас Verdant работает только на виртуальных демо-кредитах: их нельзя купить, продать или вывести.
 * Этот модуль не подключён ни к одному API-маршруту и ни к одной странице.
 *
 * Подключать реального провайдера можно только при наличии лицензии оператора в юрисдикции
 * работы сервиса, проверок KYC/AML и возрастной верификации, после юридической проверки.
 * Без этого модуль должен оставаться выключенным.
 *
 * Как это стыкуется с текущей архитектурой: любое движение денег должно идти через applyEntry()
 * (журнал баланса с ключом идемпотентности) с отдельными типами операций и отдельным кошельком
 * в реальной валюте. Демо-кредиты с реальными средствами не смешиваются.
 */
export type PaymentIntentStatus = "pending" | "succeeded" | "failed" | "cancelled";

export interface PaymentProvider {
  readonly id: string;
  /** Создать намерение платежа; idempotencyKey обязателен. */
  createIntent(p: { userId: string; amountMinor: bigint; currency: string; idempotencyKey: string }): Promise<{ intentId: string; status: PaymentIntentStatus }>;
  /** Проверить подпись и разобрать вебхук провайдера. */
  parseWebhook(rawBody: string, signature: string | null): Promise<{ intentId: string; status: PaymentIntentStatus }>;
}

/** Единственная доступная реализация: платежи выключены. */
export const paymentsDisabled: PaymentProvider = {
  id: "disabled",
  async createIntent() { throw new Error("Платежи отключены: платформа работает только на демо-кредитах"); },
  async parseWebhook() { throw new Error("Платежи отключены"); },
};

export const PAYMENTS_ENABLED = false as const;
