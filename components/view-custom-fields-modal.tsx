"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Loader2, X } from "lucide-react";
import { db } from "@/lib/firebase";

type CustomFieldType = "text" | "number" | "phone" | "email" | "datetime";

type CustomField = {
  id: string;
  label: string;
  type: CustomFieldType;
  core: boolean;
};

type ViewCustomFieldsModalProps = {
  open: boolean;
  onClose: () => void;
  companyId?: string;
  contactName?: string;
  contactData?: Record<string, unknown>;
};

export function ViewCustomFieldsModal({
  open,
  onClose,
  companyId,
  contactName,
  contactData,
}: ViewCustomFieldsModalProps) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!companyId) {
      setFields([]);
      setLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;

    async function loadFields() {
      setLoading(true);
      setError(null);
      try {
        const fieldsRef = collection(
          db,
          "company",
          companyId as string,
          "contactFields"
        );
        const fieldsQuery = query(fieldsRef, where("core", "==", false));
        const snapshot = await getDocs(fieldsQuery);
        if (!isMounted) return;

        const nextFields = snapshot.docs
          .map(
            (docSnapshot) =>
              ({
                id: docSnapshot.id,
                ...(docSnapshot.data() as Omit<CustomField, "id">),
              }) as CustomField
          )
          .sort((a, b) => a.label.localeCompare(b.label));

        setFields(nextFields);
      } catch (err) {
        console.error("Failed to load custom fields", err);
        if (!isMounted) return;
        setError("We couldn't load your custom fields. Try again.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadFields();

    return () => {
      isMounted = false;
    };
  }, [companyId, open]);

  useEffect(() => {
    if (!open) {
      setFields([]);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  const subtitle = contactName
    ? `Custom fields available for ${contactName}.`
    : "Custom fields available for this contact.";

  const getFieldValue = (field: CustomField) => {
    const rawValue = contactData ? contactData[field.id] : undefined;

    if (
      rawValue === null ||
      rawValue === undefined ||
      (typeof rawValue === "string" && rawValue.trim() === "")
    ) {
      return "not set.";
    }

    if (rawValue instanceof Date) {
      return rawValue.toLocaleString();
    }

    if (
      typeof rawValue === "object" &&
      rawValue !== null &&
      "toDate" in rawValue &&
      typeof (rawValue as { toDate?: () => Date }).toDate === "function"
    ) {
      try {
        return (rawValue as { toDate: () => Date }).toDate().toLocaleString();
      } catch {
        return "not set.";
      }
    }

    return String(rawValue);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl">
        <header className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Custom Fields
            </h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition hover:bg-muted"
            onClick={onClose}
            aria-label="Close custom fields modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto bg-muted/10 px-6 py-6">
          {!companyId ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Company configuration is missing. Check your environment
              variables.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading custom fields...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : fields.length === 0 ? (
            <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-background px-6 py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                No custom fields exists, create a new one from contacts page
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {fields.map((field) => (
                <li
                  key={field.id}
                  className="rounded-xl border bg-card px-4 py-3 shadow-sm"
                >
                  <p className="text-sm font-medium text-foreground">
                    {field.label}:{" "}
                    <span className="text-muted-foreground">
                      {getFieldValue(field)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
