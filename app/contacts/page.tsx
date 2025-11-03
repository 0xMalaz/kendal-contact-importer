"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { PlusCircle, Settings2 } from "lucide-react";
import { ImportContactsModal } from "@/components/import-contacts-modal";
import { ManageCustomFieldsModal } from "@/components/manage-custom-fields-modal";
import { ViewCustomFieldsModal } from "@/components/view-custom-fields-modal";
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

type CustomFieldType = "text" | "number" | "phone" | "email" | "datetime";

type CustomFieldDefinition = {
  id: string;
  label: string;
  type: CustomFieldType;
  showAsColumn?: boolean;
};

type TableRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdOn: string;
  contact: ContactRecord;
};

const COMPANY_ID = process.env.NEXT_PUBLIC_FIREBASE_COMPANY_ID;

export default function ContactsPage() {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCustomFieldsModalOpen, setIsCustomFieldsModalOpen] = useState(false);
  const [isViewCustomFieldsModalOpen, setIsViewCustomFieldsModalOpen] =
    useState(false);
  const [viewingContactName, setViewingContactName] = useState<string | null>(
    null
  );
  const [viewingContact, setViewingContact] = useState<ContactRecord | null>(
    null
  );
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [customFieldsError, setCustomFieldsError] = useState<string | null>(
    null
  );

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
        setError("We couldn't load your contacts. Try again in a moment.");
      } finally {
        setLoading(false);
      }
    }

    fetchContacts();
  }, []);

  const loadCustomFields = useCallback(async () => {
    if (!COMPANY_ID) {
      setCustomFields([]);
      setCustomFieldsError(null);
      return;
    }

    try {
      const fieldsRef = collection(
        db,
        "company",
        COMPANY_ID,
        "contactFields"
      );
      const fieldsQuery = query(fieldsRef, where("core", "==", false));
      const snapshot = await getDocs(fieldsQuery);
      const definitions = snapshot.docs
        .map((docSnapshot) => {
          const data = docSnapshot.data() as {
            label?: string;
            type?: CustomFieldType;
            showAsColumn?: boolean;
          };

          return {
            id: docSnapshot.id,
            label: data.label ?? docSnapshot.id,
            type: data.type ?? "text",
            showAsColumn: Boolean(data.showAsColumn),
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));

      setCustomFields(definitions);
      setCustomFieldsError(null);
    } catch (err) {
      console.error("Failed to load custom field settings", err);
      setCustomFieldsError(
        "We couldn't load custom field settings. Custom columns may be outdated."
      );
    }
  }, []);

  useEffect(() => {
    void loadCustomFields();
  }, [loadCustomFields]);

  const displayColumnFields = useMemo(
    () =>
      customFields
        .filter((field) => field.showAsColumn)
        .slice(0, 3),
    [customFields]
  );

  const rows: TableRow[] = useMemo(
    () =>
      contacts.map((contact) => {
        const firstName = (contact.firstName as string | undefined) ?? "";
        const lastName = (contact.lastName as string | undefined) ?? "";
        const displayName = [firstName, lastName].filter(Boolean).join(" ");
        const createdOn =
          contact.createdOn && "toDate" in contact.createdOn
            ? contact.createdOn.toDate().toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "-";

        return {
          id: contact.id,
          name: displayName || "Unknown contact",
          email: (contact.email as string | undefined) ?? "-",
          phone: (contact.phone as string | undefined) ?? "-",
          createdOn,
          contact,
        };
      }),
    [contacts]
  );

  const handleViewCustomFields = (
    contact: ContactRecord,
    contactDisplayName: string
  ) => {
    setViewingContact(contact);
    setViewingContactName(contactDisplayName);
    setIsViewCustomFieldsModalOpen(true);
  };

  const formatCustomFieldValue = useCallback(
    (contact: ContactRecord, fieldId: string) => {
      const rawValue = contact[fieldId];

      if (rawValue === null || rawValue === undefined) {
        return "-";
      }

      if (typeof rawValue === "string") {
        const trimmed = rawValue.trim();
        return trimmed.length > 0 ? trimmed : "-";
      }

      if (typeof rawValue === "number" || typeof rawValue === "boolean") {
        return String(rawValue);
      }

      if (rawValue instanceof Date) {
        return rawValue.toLocaleString();
      }

      if (Array.isArray(rawValue)) {
        return rawValue.length ? rawValue.join(", ") : "-";
      }

      if (typeof rawValue === "object" && rawValue !== null) {
        const maybeTimestamp = rawValue as { toDate?: () => Date };
        if (typeof maybeTimestamp.toDate === "function") {
          try {
            return maybeTimestamp.toDate().toLocaleString();
          } catch {
            return "-";
          }
        }
      }

      return "-";
    },
    []
  );

  const handleCustomFieldsRefresh = useCallback(() => {
    void loadCustomFields();
  }, [loadCustomFields]);

  const handleCloseCustomFieldsModal = () => {
    setIsViewCustomFieldsModalOpen(false);
    setViewingContact(null);
    setViewingContactName(null);
  };

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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCustomFieldsModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-muted-foreground/30 px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:border-primary/40 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!COMPANY_ID}
              title={
                COMPANY_ID ? undefined : "Company configuration is missing."
              }
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Manage Custom Fields
            </button>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              Import Contacts
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-6 py-4 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            {customFieldsError ? (
              <div className="rounded-lg border border-muted-foreground/30 bg-muted/20 px-6 py-3 text-xs text-muted-foreground">
                {customFieldsError}
              </div>
            ) : null}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <table className="min-w-full divide-y divide-border/70">
                <thead className="bg-muted/60">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Email</th>
                    <th className="px-6 py-3">Phone</th>
                    <th className="px-6 py-3">Created</th>
                    {displayColumnFields.map((field) => (
                      <th key={field.id} className="px-6 py-3">
                        {field.label}
                      </th>
                    ))}
                    <th className="px-6 py-3 text-right">Custom Fields</th>
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
                          <div className="h-4 w-24 rounded bg-muted/80" />
                        </td>
                        {displayColumnFields.map((field) => (
                          <td key={`${field.id}-skeleton`} className="px-6 py-4">
                            <div className="h-4 w-24 rounded bg-muted/80" />
                          </td>
                        ))}
                        <td className="px-6 py-4 text-right">
                          <div className="ml-auto h-4 w-28 rounded bg-muted/80" />
                        </td>
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5 + displayColumnFields.length}
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
                          {row.createdOn}
                        </td>
                        {displayColumnFields.map((field) => (
                          <td
                            key={`${row.id}-${field.id}`}
                            className="px-6 py-4 text-muted-foreground"
                          >
                            {formatCustomFieldValue(row.contact, field.id)}
                          </td>
                        ))}
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              handleViewCustomFields(row.contact, row.name)
                            }
                            disabled={!COMPANY_ID}
                            className="text-sm font-medium text-primary transition hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground"
                            title={
                              COMPANY_ID
                                ? undefined
                                : "Company configuration is missing."
                            }
                          >
                            See custom fields
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ManageCustomFieldsModal
        open={isCustomFieldsModalOpen}
        onClose={() => setIsCustomFieldsModalOpen(false)}
        companyId={COMPANY_ID}
        onFieldsChange={handleCustomFieldsRefresh}
      />
      <ViewCustomFieldsModal
        open={isViewCustomFieldsModalOpen}
        onClose={handleCloseCustomFieldsModal}
        companyId={COMPANY_ID}
        contactName={viewingContactName ?? undefined}
        contactData={viewingContact ?? undefined}
      />

      <ImportContactsModal
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </>
  );
}



