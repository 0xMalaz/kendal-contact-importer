"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { PlusCircle } from "lucide-react";
import { ImportContactsModal } from "@/components/import-contacts-modal";
import { db } from "@/lib/firebase";

type ContactRecord = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  agentUid?: string;
  createdOn?: Timestamp | null;
  [key: string]: unknown;
};

type TableRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  agent: string;
  createdOn: string;
};

const COMPANY_ID = process.env.NEXT_PUBLIC_FIREBASE_COMPANY_ID;

export default function ContactsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchContacts() {
      setLoading(true);
      setError(null);

      if (!COMPANY_ID) {
        setError("Company configuration is missing.");
        setContacts([]);
        setLoading(false);
        return;
      }

      try {
        const contactsRef = collection(
          db,
          "company",
          COMPANY_ID,
          "contacts"
        );
        const contactsQuery = query(contactsRef);
        const snapshot = await getDocs(contactsQuery);
        const records = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Record<string, unknown>),
        })) as ContactRecord[];

        records.sort((a, b) => {
          const aTime =
            (a.createdOn && "toMillis" in a.createdOn
              ? a.createdOn.toMillis()
              : 0) ?? 0;
          const bTime =
            (b.createdOn && "toMillis" in b.createdOn
              ? b.createdOn.toMillis()
              : 0) ?? 0;
          return bTime - aTime;
        });

        setContacts(records);
      } catch (err) {
        console.error("Failed to load contacts", err);
        setError("We couldn’t load your contacts. Try again in a moment.");
      } finally {
        setLoading(false);
      }
    }

    fetchContacts();
  }, []);

  const rows: TableRow[] = useMemo(
    () =>
      contacts.map((contact) => {
        const firstName = contact.firstName ?? "";
        const lastName = contact.lastName ?? "";
        const displayName = [firstName, lastName].filter(Boolean).join(" ");
        const createdOn =
          contact.createdOn && "toDate" in contact.createdOn
            ? contact.createdOn.toDate().toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "—";

        return {
          id: contact.id,
          name: displayName || "Unknown contact",
          email: contact.email ?? "—",
          phone: contact.phone ?? "—",
          agent: contact.agentUid ?? "Unassigned",
          createdOn,
        };
      }),
    [contacts]
  );

  return (
    <>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Contacts
            </h1>
            <p className="text-sm text-muted-foreground">
              Review and manage your contacts
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Import Contacts
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-6 py-4 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <table className="min-w-full divide-y divide-border/70">
              <thead className="bg-muted/60">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Phone</th>
                  <th className="px-6 py-3">Assigned</th>
                  <th className="px-6 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70 text-sm">
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`skeleton-${index}`} className="animate-pulse">
                      <td className="px-6 py-4">
                        <div className="h-4 w-32 rounded bg-muted/80" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-40 rounded bg-muted/80" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-24 rounded bg-muted/80" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-20 rounded bg-muted/80" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-24 rounded bg-muted/80" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-16 text-center text-sm text-muted-foreground"
                    >
                      No contacts found. Import a CSV to get started.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="transition hover:bg-muted/60">
                      <td className="px-6 py-4 font-medium text-foreground">
                        {row.name}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {row.email}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {row.phone}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {row.agent}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {row.createdOn}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ImportContactsModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
