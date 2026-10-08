"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthContext";
import RecordsDashboard from "../components/RecordsDashboard";

/** Records index — the landing page after login, for every role. */
export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const isFinance = user?.role === "finance";
  useEffect(() => {
    if (isFinance) router.replace("/finance");
  }, [isFinance, router]);
  return (
    <AppLayout>
      {!isFinance && <RecordsDashboard />}
    </AppLayout>
  );
}
