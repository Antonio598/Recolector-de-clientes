"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recarga los datos del servidor cada `ms` mientras el componente esté montado. */
export function AutoRefresh({ ms = 3000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [router, ms]);
  return null;
}
