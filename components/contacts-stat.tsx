"use client";

import { useEffect, useState } from "react";

const COMPANY_ID = process.env.NEXT_PUBLIC_FIREBASE_COMPANY_ID;
const FALLBACK_DISPLAY = "-";

export function ContactsStat() {
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCount() {
      if (!COMPANY_ID) {
        setError("Company ID missing");
        return;
      }

      try {
        const response = await fetch(
          `/api/contacts/count?companyId=${encodeURIComponent(COMPANY_ID)}`
        );

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const data = (await response.json()) as { count?: number };
        setTotal(typeof data.count === "number" ? data.count : null);
      } catch (err) {
        console.error("Failed to fetch contact count", err);
        setError(FALLBACK_DISPLAY);
      }
    }

    fetchCount();
  }, []);

  if (error) {
    return (
      <>
        <p className="mt-4 text-3xl font-semibold text-foreground">{error}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Unable to fetch data.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="mt-4 text-3xl font-semibold text-foreground">
        {total ?? FALLBACK_DISPLAY}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">Updated just now</p>
    </>
  );
}
