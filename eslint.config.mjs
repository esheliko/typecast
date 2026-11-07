import { FlatCompat } from "@eslint/eslintrc";
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
export default [{ ignores: [".next/**", "artifact.html", "public/sw.js"] }, ...compat.extends("next/core-web-vitals", "next/typescript")];
