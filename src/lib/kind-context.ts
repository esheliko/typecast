import { createContext } from "react";
import type { Kind } from "./kind";

/** The Library's Films / Series choice, so pieces rendered inside it (Watch next) follow the same switch. Client components only. */
export const KindContext = createContext<Kind>("all");
