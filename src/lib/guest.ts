// Демо-гость: временный аккаунт без регистрации. Отличается служебным доменом почты; удаляется через 3 дня.
export const GUEST_DOMAIN = "guest.local";
export const isGuestEmail = (email: string | null | undefined) => !!email && email.endsWith(`@${GUEST_DOMAIN}`);
