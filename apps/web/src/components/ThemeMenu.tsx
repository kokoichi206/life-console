import { Menu } from "@base-ui/react/menu";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import { applyTheme, useTheme } from "../theme";

import { Button } from "./ui/Button";

const themeOptions = [
  { value: "light", label: "ライト", icon: Sun },
  { value: "dark", label: "ダーク", icon: Moon },
  { value: "system", label: "端末に合わせる", icon: Monitor },
] as const;

export const ThemeMenu = ({ alwaysVisible = false }: { readonly alwaysVisible?: boolean }) => {
  const theme = useTheme();
  const ThemeIcon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  return (
    <div className={alwaysVisible ? "shrink-0" : "shrink-0 md:hidden"}>
      <Menu.Root>
        <Menu.Trigger render={<Button variant="outline" className="size-11 rounded-xl" />} aria-label="表示テーマ" title="表示テーマ">
          <ThemeIcon aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={8} className="z-50">
            <Menu.Popup className="min-w-48 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg outline-none" aria-label="表示テーマ">
              <Menu.RadioGroup value={theme}>
                {themeOptions.map((option) => (
                  <Menu.RadioItem key={option.value} value={option.value} closeOnClick onClick={() => applyTheme(option.value)} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground">
                    <option.icon className="size-4" aria-hidden="true" />
                    <span className="flex-1">{option.label}</span>
                    <Menu.RadioItemIndicator><Check className="size-4" aria-hidden="true" /></Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
};
