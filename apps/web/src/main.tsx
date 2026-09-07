import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { clientEnv } from "./env/client-env";
import { queryClient, router } from "./router";
import { applyTheme, storedTheme } from "./theme";
import "./styles.css";

applyTheme(storedTheme());
document.documentElement.dataset.appEnv = clientEnv.APP_ENV;

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("#root element がありません。");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
