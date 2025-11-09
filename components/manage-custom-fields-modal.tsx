"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";

type CustomFieldType = "text" | "number" | "phone" | "email" | "datetime";

type CustomField = {
  id: string;
  label: string;
  type: CustomFieldType;
  core: boolean;
  showAsColumn?: boolean;
};

type ManageCustomFieldsModalProps = {
  open: boolean;
  onClose: () => void;
  companyId?: string;
  onFieldsChange?: () => void;
};

type FormState = {
  label: string;
  type: CustomFieldType;
};

const FIELD_TYPE_OPTIONS: { label: string; value: CustomFieldType }[] = [
  { label: "Text", value: "text" },
  { label: "Number", value: "number" },
  { label: "Phone", value: "phone" },
  { label: "Email", value: "email" },
  { label: "Date & Time", value: "datetime" },
];

const DEFAULT_FORM: FormState = {
  label: "",
  type: "text",
};

function createFieldId(label: string) {
  const parts = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/gi, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "";
  }

  return parts
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join("");
}

function mapToCustomField(field: {
  id: string;
  label?: string;
  type?: CustomFieldType;
  core?: unknown;
  showAsColumn?: unknown;
}): CustomField {
  return {
    id: field.id,
    label: field.label ?? field.id,
    type: field.type ?? "text",
    core: Boolean(field.core),
    showAsColumn: Boolean(field.showAsColumn),
  };
}

export function ManageCustomFieldsModal({
  open,
  onClose,
  companyId,
  onFieldsChange,
}: ManageCustomFieldsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [formState, setFormState] = useState<FormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingFieldId, setTogglingFieldId] = useState<string | null>(null);

  const isReady = useMemo(() => Boolean(companyId), [companyId]);

  const resetForm = useCallback(() => {
    setFormState(DEFAULT_FORM);
    setFormError(null);
    setSaving(false);
    setEditingId(null);
    setIsFormVisible(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  useEffect(() => {
    if (!open || !isReady) {
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
            showAsColumn?: unknown;
          }>;
        };

        if (!isMounted) return;

        const nextFields = (data.fields ?? [])
          .map((field) => mapToCustomField(field))
          .sort((a, b) => a.label.localeCompare(b.label));

        setFields(nextFields);
      } catch (err) {
        console.error("Failed to load custom contact fields", err);
        if (!isMounted) return;
        setError("We couldn't load your custom fields. Try again in a moment.");
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
  }, [companyId, isReady, open]);

  useEffect(() => {
    if (!open) {
      setFields([]);
      setError(null);
      resetForm();
      setLoading(false);
      setTogglingFieldId(null);
    }
  }, [open, resetForm]);

  const handleStartCreate = () => {
    setEditingId(null);
    setFormState(DEFAULT_FORM);
    setFormError(null);
    setIsFormVisible(true);
  };

  const handleStartEdit = (field: CustomField) => {
    setEditingId(field.id);
    setFormState({ label: field.label, type: field.type });
    setFormError(null);
    setIsFormVisible(true);
  };

  const handleToggleShowAsColumn = async (
    field: CustomField,
    checked: boolean
  ) => {
    if (!isReady) return;

    const currentActiveCount = fields.filter(
      (item) => item.showAsColumn
    ).length;
    const nextActiveCount = checked
      ? currentActiveCount + (field.showAsColumn ? 0 : 1)
      : currentActiveCount - (field.showAsColumn ? 1 : 0);

    if (checked && nextActiveCount > 3) {
      toast.error("You can show up to 3 custom columns.", {
        position: "bottom-right",
      });
      return;
    }

    setTogglingFieldId(field.id);

    try {
      const response = await fetch(`/api/custom-fields/${field.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId,
          showAsColumn: checked,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as {
        field?: {
          id: string;
          label?: string;
          type?: CustomFieldType;
          core?: unknown;
          showAsColumn?: unknown;
        };
      };

      const updatedField = data.field
        ? mapToCustomField(data.field)
        : { ...field, showAsColumn: checked };

      setFields((prev) =>
        prev.map((item) => (item.id === field.id ? updatedField : item))
      );
      onFieldsChange?.();
    } catch (err) {
      console.error("Failed to update column visibility", err);
      toast.error("We couldn't update column visibility. Try again.", {
        position: "bottom-right",
      });
    } finally {
      setTogglingFieldId(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isReady) {
      setFormError("Company configuration is missing.");
      return;
    }

    const label = formState.label.trim();
    if (!label) {
      setFormError("Label is required.");
      return;
    }

    const generatedId = createFieldId(label);
    if (!generatedId) {
      setFormError("Label must include letters or numbers.");
      return;
    }

    const duplicate = fields.find(
      (field) => field.id === generatedId && field.id !== editingId
    );
    if (duplicate) {
      setFormError("A field with this label already exists.");
      return;
    }

    const existingField = editingId
      ? fields.find((field) => field.id === editingId)
      : undefined;

    const payload = {
      label,
      type: formState.type,
      core: false,
      showAsColumn: existingField?.showAsColumn ?? false,
    };

    setSaving(true);
    setFormError(null);

    try {
      const response = await fetch("/api/custom-fields", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId,
          id: generatedId,
          previousId:
            editingId && editingId !== generatedId ? editingId : undefined,
          ...payload,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as {
        field?: {
          id: string;
          label?: string;
          type?: CustomFieldType;
          core?: unknown;
          showAsColumn?: unknown;
        };
      };

      const savedField = data.field
        ? mapToCustomField(data.field)
        : mapToCustomField({ id: generatedId, ...payload });

      setFields((prev) => {
        const filtered = prev.filter((field) => field.id !== editingId);
        return [...filtered, savedField].sort((a, b) =>
          a.label.localeCompare(b.label)
        );
      });

      toast.success(editingId ? "Field updated" : "Field added");
      onFieldsChange?.();
      resetForm();
    } catch (err) {
      console.error("Failed to save custom field", err);
      setFormError("We couldn't save this field. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (fieldId: string) => {
    if (!isReady) return;

    setDeletingId(fieldId);

    try {
      const response = await fetch(
        `/api/custom-fields/${fieldId}?companyId=${encodeURIComponent(
          companyId as string
        )}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      setFields((prev) => prev.filter((field) => field.id !== fieldId));
      toast.success("Field deleted");
      onFieldsChange?.();
    } catch (err) {
      console.error("Failed to delete custom field", err);
      toast.error("We couldn't delete this field. Try again.");
    } finally {
      setDeletingId(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Manage Custom Fields
            </h2>
            <p className="text-xs text-muted-foreground">
              Add, edit, or remove custom fields for your contacts.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted"
            onClick={handleClose}
            aria-label="Close custom fields modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto bg-muted/20 px-6 py-6">
          {!isReady ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Company configuration is missing. Check your environment
              variables.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading fields…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <div className="space-y-6">
              <section className="space-y-3">
                <header className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Custom Fields
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Core fields are managed automatically and can’t be edited
                      here.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartCreate}
                    className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-xs font-medium text-primary transition hover:bg-primary/10"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add a Custom Field
                  </button>
                </header>

                {fields.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-background px-6 py-10 text-center">
                    <p className="text-sm font-medium text-foreground">
                      You haven’t created any custom fields yet.
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Create custom fields to capture information specific to
                      your workflow.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {fields.map((field) => (
                      <li
                        key={field.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {field.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Type:{" "}
                            {FIELD_TYPE_OPTIONS.find(
                              (option) => option.value === field.type
                            )?.label ?? field.type}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded-full border border-muted-foreground/40 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed"
                              checked={Boolean(field.showAsColumn)}
                              onChange={(event) =>
                                handleToggleShowAsColumn(
                                  field,
                                  event.target.checked
                                )
                              }
                              disabled={togglingFieldId === field.id}
                            />
                            Show as a Column
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(field)}
                              className="inline-flex items-center gap-1 rounded-lg border border-muted-foreground/20 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted"
                            >
                              <Pencil
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(field.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
                              disabled={deletingId === field.id}
                            >
                              {deletingId === field.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              )}
                              Delete
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {isFormVisible && (
                <section className="rounded-2xl border bg-card px-6 py-5 shadow-sm">
                  <header className="mb-4 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">
                        {editingId ? "Edit Custom Field" : "New Custom Field"}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Core fields are always required and can’t be modified.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="inline-flex items-center gap-1 rounded-lg border border-muted-foreground/20 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Cancel
                    </button>
                  </header>

                  <form className="space-y-5" onSubmit={handleSubmit}>
                    <div className="space-y-2">
                      <label
                        htmlFor="field-label"
                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Label
                      </label>
                      <input
                        id="field-label"
                        type="text"
                        value={formState.label}
                        onChange={(event) =>
                          setFormState((prev) => ({
                            ...prev,
                            label: event.target.value,
                          }))
                        }
                        placeholder="e.g. Lead Source"
                        className="w-full rounded-lg border border-muted-foreground/30 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        The field id will be generated automatically from this
                        label.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="field-type"
                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Field Type
                      </label>
                      <select
                        id="field-type"
                        value={formState.type}
                        onChange={(event) =>
                          setFormState((prev) => ({
                            ...prev,
                            type: event.target.value as CustomFieldType,
                          }))
                        }
                        className="w-full rounded-lg border border-muted-foreground/30 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        {FIELD_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {formError ? (
                      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {formError}
                      </div>
                    ) : null}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" aria-hidden="true" />
                        )}
                        {editingId ? "Save Changes" : "Create Field"}
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
