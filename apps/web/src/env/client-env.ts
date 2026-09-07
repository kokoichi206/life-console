import { clientEnvSchema } from "./client-env-schema";

export const clientEnv = clientEnvSchema.parse({ APP_ENV: import.meta.env.VITE_APP_ENV });
