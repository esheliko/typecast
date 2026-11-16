export type Theme = "system" | "light" | "dark";
export const THEME_KEY = "tc-theme";
export const THEMES: [Theme, string][] = [["system", "System"], ["light", "Light"], ["dark", "Dark"]];

/** Runs before first paint (inline in <head>) so a saved choice never flashes the wrong theme. */
export const THEME_INIT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
