// Должно загрузиться раньше Next.js: в собственном сервере Next ожидает AsyncLocalStorage в глобальной области.
import { AsyncLocalStorage } from "node:async_hooks";
(globalThis as unknown as { AsyncLocalStorage: typeof AsyncLocalStorage }).AsyncLocalStorage ??= AsyncLocalStorage;
