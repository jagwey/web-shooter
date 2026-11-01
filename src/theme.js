// UI skin for the control window. Anything other than "anime" falls back to minimal.
export const THEMES = ["minimal", "anime"];

export function applyTheme(name) {
  const theme = name === "anime" ? "anime" : "minimal";
  document.documentElement.dataset.theme = theme;
  return theme;
}
