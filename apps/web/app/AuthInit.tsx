"use client";

import { useEffect } from "react";
import { ensureSession } from "@/lib/supabase";

export default function AuthInit() {
  useEffect(() => {
    ensureSession();
  }, []);
  return null;
}
