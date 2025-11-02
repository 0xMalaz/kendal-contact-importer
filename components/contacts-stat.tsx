"use client";

import { collection, getCountFromServer } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";

const COMPANY_ID = process.env.NEXT_PUBLIC_FIREBASE_COMPANY_ID;

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
        const contactsRef = collection(
          db,
          "company",
          COMPANY_ID,
          "contacts"
        );
        const snapshot = await getCountFromServer(contactsRef);
        setTotal(snapshot.data().count);
      } catch (err) {
        console.error("Failed to fetch contact count", err);
        setError("—");
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
        {total ?? "—"}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Updated just now
      </p>
    </>
  );
}
