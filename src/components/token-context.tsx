"use client";

import { createContext, useContext } from "react";

export const TokenContext = createContext<string>("");

export function useAuthToken() {
  return useContext(TokenContext);
}
