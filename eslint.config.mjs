import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default [
  { ignores: [".next/**", "artifact.html", "public/sw.js"] },
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next 16 enables the React Compiler rules of eslint-plugin-react-hooks 7. Typecast does not use the
    // compiler and these flag ~60 existing, working patterns, so they are off until someone opts in and cleans them up.
    rules: {
      "react-hooks/error-boundaries": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  },
];
