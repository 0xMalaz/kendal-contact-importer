"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

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
      return new Date(seconds * 1000 + nanoseconds / 1_000_000);
    }
  }

  return null;
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "not set.";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : "not set.";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toLocaleString();
  }

  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => formatFieldValue(item)).join(", ")
      : "not set.";
  }

  const maybeDate = timestampToDate(value);
  if (maybeDate) {
    return maybeDate.toLocaleString();
  }

  return "not set.";
}

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
        const response = await fetch(
          `/api/custom-fields?companyId=${encodeURIComponent(
            companyId as string
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
            core?: unknown;
          }>;
        };

        if (!isMounted) return;

        const nextFields = (data.fields ?? [])
          .map((field) => ({
            id: field.id,
            label: field.label ?? field.id,
            type: field.type ?? "text",
            core: Boolean(field.core),
          }))
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
    return formatFieldValue(rawValue);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Custom Fields
            </h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted"
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
