"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusCircle, Settings2 } from "lucide-react";
import { ImportContactsModal } from "@/components/import-contacts-modal";
import { ManageCustomFieldsModal } from "@/components/manage-custom-fields-modal";
import { ViewCustomFieldsModal } from "@/components/view-custom-fields-modal";

type ContactRecord = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  agentUid?: string;
  createdOn?:
    | {
        seconds: number;
        nanoseconds: number;
      }
    | {
        _seconds: number;
        _nanoseconds: number;
      }
    | {
        toMillis?: () => number;
        toDate?: () => Date;
      }
    | Date
    | number
    | string
    | null;
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

function timestampToDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? new Date(value) : null;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "object") {
    const maybeTimestamp = value as {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
    };

    if (typeof maybeTimestamp.toDate === "function") {
      try {
        return maybeTimestamp.toDate();
      } catch {
        return null;
      }
    }

    if (typeof maybeTimestamp.toMillis === "function") {
      try {
        const millis = maybeTimestamp.toMillis();
        return Number.isFinite(millis) ? new Date(millis) : null;
      } catch {
        return null;
      }
    }

    const seconds =
      typeof maybeTimestamp.seconds === "number"
        ? maybeTimestamp.seconds
        : typeof maybeTimestamp._seconds === "number"
          ? maybeTimestamp._seconds
          : undefined;
    const nanoseconds =
      typeof maybeTimestamp.nanoseconds === "number"
        ? maybeTimestamp.nanoseconds
        : typeof maybeTimestamp._nanoseconds === "number"
          ? maybeTimestamp._nanoseconds
          : 0;

    if (typeof seconds === "number") {
      const millis = seconds * 1000 + nanoseconds / 1_000_000;
      return new Date(millis);
    }
  }

  return null;
}

function timestampToMillis(value: unknown): number {
  const date = timestampToDate(value);
  return date ? date.getTime() : 0;
}

function formatTimestamp(value: unknown, fallback = "-"): string {
  const date = timestampToDate(value);
  if (!date) {
    return fallback;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatGenericValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "-";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toLocaleString();
  }

  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => formatGenericValue(item)).join(", ")
      : "-";
  }

  const maybeDate = timestampToDate(value);
  if (maybeDate) {
    return maybeDate.toLocaleString();
  }

  return "-";
}

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
        const response = await fetch(
          `/api/contacts?companyId=${encodeURIComponent(COMPANY_ID)}`
        );

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const data = (await response.json()) as {
          contacts?: ContactRecord[];
        };

        const records = Array.isArray(data.contacts) ? data.contacts : [];

        records.sort(
          (a, b) => timestampToMillis(b.createdOn) - timestampToMillis(a.createdOn)
        );

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
      const response = await fetch(
        `/api/custom-fields?companyId=${encodeURIComponent(
          COMPANY_ID
        )}&includeCore=false`
      );

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as {
        fields?: Array<{
          id: string;
          label?: string;
          type?: CustomFieldType;
          showAsColumn?: unknown;
        }>;
      };

      const definitions = (data.fields ?? [])
        .map((field) => ({
          id: field.id,
          label: field.label ?? field.id,
          type: field.type ?? "text",
          showAsColumn: Boolean(field.showAsColumn),
        }))
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
        const createdOn = formatTimestamp(contact.createdOn);

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
    (contact: ContactRecord, fieldId: string) =>
      formatGenericValue(contact[fieldId]),
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
                    <th className="px-6 py-3">Custom Fields</th>
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
                        <td className="px-6 py-4">
                          <div className="h-4 w-28 rounded bg-muted/80" />
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
                        <td className="px-6 py-4">
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
                            View more
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
