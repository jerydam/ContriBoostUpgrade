"use client";

import { useEffect } from "react";
import { showToast } from "@/utils/toast";

export function ErrorBoundary({ children }) {
  useEffect(() => {
    const handleError = (error) => {
      console.error("Uncaught error:", error);
      showToast("An unexpected error occurred. Please refresh the page.", "error");
    };
    window.addEventListener("error", handleError);
    return () => window.removeEventListener("error", handleError);
  }, []);

  return children;
}