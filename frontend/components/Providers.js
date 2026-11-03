"use client";

import { AuthProvider } from "./AuthProvider";
import { ThemeProvider } from "./ThemeProvider";

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
