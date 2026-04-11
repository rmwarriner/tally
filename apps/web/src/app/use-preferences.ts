import { useState } from "react";
import type { AmountStyle } from "./app-format";

export type Theme = "light" | "dark" | "gruvbox";
export type Density = "compact" | "comfortable";

export interface AppPreferences {
  amountStyle: AmountStyle;
  density: Density;
  theme: Theme;
}

const DEFAULTS: AppPreferences = {
  amountStyle: "both",
  density: "comfortable",
  theme: "light",
};

const STORAGE_KEY = "tally.preferences";

export function resolveStoredTheme(theme: unknown): Theme {
  return theme === "dark" || theme === "gruvbox" ? theme : "light";
}

function loadPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULTS;
    }

    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      theme: resolveStoredTheme(parsed.theme),
      density: parsed.density === "compact" ? "compact" : "comfortable",
      amountStyle:
        parsed.amountStyle === "color" || parsed.amountStyle === "sign"
          ? parsed.amountStyle
          : "both",
    };
  } catch {
    return DEFAULTS;
  }
}

function savePreferences(preferences: AppPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // localStorage may be unavailable; continue without persistence.
  }
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<AppPreferences>(loadPreferences);

  function update(next: AppPreferences) {
    setPreferences(next);
    savePreferences(next);
  }

  return {
    preferences,
    setTheme: (theme: Theme) => update({ ...preferences, theme }),
    setDensity: (density: Density) => update({ ...preferences, density }),
    setAmountStyle: (amountStyle: AmountStyle) => update({ ...preferences, amountStyle }),
  };
}
