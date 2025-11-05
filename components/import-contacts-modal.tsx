"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Link2,
  Loader2,
  Minus,
  Paperclip,
  Pencil,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import type { ParseResult } from "papaparse";
import { FieldMapper } from "@/lib/mapping/fieldMapper";
import type {
  ColumnMapping,
  ContactField as MappingContactField,
  ContactFieldType,
} from "@/lib/mapping/types";

type ContactFieldWithMeta = MappingContactField & {
  showAsColumn?: boolean;
};

type RawContactField = Partial<ContactFieldWithMeta>;

const VALID_FIELD_TYPES: ContactFieldType[] = [
  "text",
  "number",
  "phone",
  "email",
  "datetime",
];

function normalizeFieldType(value: unknown): ContactFieldType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return (VALID_FIELD_TYPES as string[]).includes(normalized)
    ? (normalized as ContactFieldType)
    : null;
}

function normalizeContactField(
  field: RawContactField | null | undefined
): ContactFieldWithMeta | null {
  if (!field) {
    return null;
  }

  const id = typeof field.id === "string" ? field.id.trim() : "";
  if (!id.length) {
    return null;
  }

  const label =
    typeof field.label === "string" && field.label.trim().length
      ? field.label.trim()
      : id;

  const type = normalizeFieldType(field.type) ?? "text";

  return {
    id,
    label,
    type,
    core: Boolean(field.core),
    showAsColumn: Boolean(field.showAsColumn),
  };
}

type StepStatus = "complete" | "active" | "upcoming";

type ImportContactsModalProps = {
  open: boolean;
  onClose: () => void;
};

export function ImportContactsModal({ open, onClose }: ImportContactsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsingState, setParsingState] = useState<
    "idle" | "parsing" | "parsed" | "error"
  >("idle");
  const [parseProgress, setParseProgress] = useState(0);
  const [contactFields, setContactFields] = useState<ContactFieldWithMeta[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [initialColumnMappings, setInitialColumnMappings] = useState<ColumnMapping[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvSampleRows, setCsvSampleRows] = useState<string[][]>([]);
  const [mappingStage, setMappingStage] = useState<"summary" | "detailed">("summary");
  const [editingState, setEditingState] = useState<{
    csvIndex: number;
    draftFieldId: string | null;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sampleRowsRef = useRef<string[][]>([]);
  const headersRef = useRef<string[]>([]);

  const COMPANY_ID = process.env.NEXT_PUBLIC_FIREBASE_COMPANY_ID;

  const reset = useCallback(() => {
    setFile(null);
    setIsDragging(false);
    setParsingState("idle");
    setParseProgress(0);
    setColumnMappings([]);
    setInitialColumnMappings([]);
    setCsvHeaders([]);
    setCsvSampleRows([]);
    setMappingStage("summary");
    setEditingState(null);
    setIsAnalyzing(false);
    setMappingError(null);
    sampleRowsRef.current = [];
    headersRef.current = [];
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let isCancelled = false;

    async function loadContactFields() {
      if (!COMPANY_ID) {
        setFieldsError("Missing company configuration");
        setContactFields([]);
        return;
      }

      setFieldsLoading(true);
      setFieldsError(null);
      try {
        const response = await fetch(
          `/api/custom-fields?companyId=${encodeURIComponent(
            COMPANY_ID
          )}&includeCore=true`
        );

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as {
          fields?: RawContactField[];
        };

        const normalized =
          payload.fields
            ?.map((field) => normalizeContactField(field))
            .filter(
              (field): field is ContactFieldWithMeta => Boolean(field)
            ) ?? [];

        if (!isCancelled) {
          setContactFields(normalized);
        }
      } catch (error) {
        console.error("Failed to load contact fields", error);
        if (!isCancelled) {
          setFieldsError("Unable to load contact fields");
          setContactFields([]);
        }
      } finally {
        if (!isCancelled) {
          setFieldsLoading(false);
        }
      }
    }

    loadContactFields();

    return () => {
      isCancelled = true;
    };
  }, [COMPANY_ID, open]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return false;
    const nextFile = files[0];
    const allowedTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    const matchesExtension =
      nextFile.name.toLowerCase().endsWith(".csv") ||
      nextFile.name.toLowerCase().endsWith(".xlsx");

    if (
      allowedTypes.includes(nextFile.type) ||
      matchesExtension
    ) {
      setFile(nextFile);
      return true;
    }

    toast.error("Only .csv and .xlsx formats are supported");
    return false;
  }, []);

  useEffect(() => {
    if (!file) {
      setParsingState("idle");
      setParseProgress(0);
      setColumnMappings([]);
      setInitialColumnMappings([]);
      setCsvHeaders([]);
      setCsvSampleRows([]);
      setMappingStage("summary");
      setEditingState(null);
      setIsAnalyzing(false);
      setMappingError(null);
      sampleRowsRef.current = [];
      headersRef.current = [];
      return;
    }

    let isCancelled = false;
    sampleRowsRef.current = [];
    headersRef.current = [];

    async function parseSelectedFile() {
      setParsingState("parsing");
      setParseProgress(0);
      try {
        const PapaModule = await import("papaparse"); // dynamic import for smaller bundle size as we only need this during parsing
        const Papa = (PapaModule.default ?? PapaModule) as typeof import("papaparse");

        await new Promise<void>((resolve, reject) => {
          Papa.parse(file, {
            header: true,
            worker: true,
            skipEmptyLines: "greedy",
            chunk: (results) => {
              if (isCancelled || !results) {
                return;
              }

              const metaFields = Array.isArray(results.meta?.fields)
                ? results.meta?.fields
                    .filter(
                      (field): field is string =>
                        typeof field === "string" && field.trim().length > 0
                    )
                    .map((field) => field.trim())
                : null;

              if (metaFields?.length) {
                headersRef.current = metaFields;
              }

              const rows = Array.isArray(results.data)
                ? (results.data as Record<string, unknown>[])
                : [];

              for (const row of rows) {
                if (!row || typeof row !== "object") {
                  continue;
                }

                const rowValues: Record<string, string> = {};
                const entries = Object.entries(row);
                for (const [header, value] of entries) {
                  if (typeof header !== "string" || !header.trim().length) {
                    continue;
                  }

                  const normalizedHeader = header.trim();
                  if (!headersRef.current.includes(normalizedHeader)) {
                    headersRef.current.push(normalizedHeader);
                  }

                  const valueString =
                    value === null || value === undefined
                      ? ""
                      : typeof value === "string"
                        ? value.trim()
                        : String(value).trim();

                  rowValues[normalizedHeader] = valueString;
                }

                if (sampleRowsRef.current.length < 100) {
                  const headerOrder = headersRef.current.length
                    ? headersRef.current
                    : Object.keys(rowValues);
                  const orderedHeaders = Array.from(
                    new Set(
                      headerOrder
                        .map((header) => header.trim())
                        .filter((header) => header.length > 0)
                    )
                  );
                  const orderedRow = orderedHeaders.map(
                    (header) => rowValues[header] ?? ""
                  );
                  sampleRowsRef.current.push(orderedRow);
                }
              }

              const cursor =
                typeof results.meta?.cursor === "number"
                  ? results.meta.cursor
                  : null;

              if (cursor !== null && Number.isFinite(cursor) && file.size > 0) {
                const nextProgress = Math.min(0.99, Math.max(0, cursor / file.size));
                setParseProgress((previous) =>
                  nextProgress > previous ? nextProgress : previous
                );
              } else {
                setParseProgress((previous) =>
                  previous < 0.9 ? Math.min(0.9, previous + 0.02) : previous
                );
              }
            },
            complete: (results: ParseResult<Record<string, unknown>>) => {
              if (isCancelled) {
                resolve();
                return;
              }

              const rawMetaFields = results?.meta?.fields;
              if (Array.isArray(rawMetaFields) && rawMetaFields.length) {
                const normalizedMeta = rawMetaFields
                  .filter(
                    (field): field is string =>
                      typeof field === "string" && field.trim().length > 0
                  )
                  .map((field) => field.trim());
                if (normalizedMeta.length) {
                  headersRef.current = normalizedMeta;
                }
              }

              const seenHeaders = headersRef.current;

              const uniqueHeaders = Array.from(
                new Set(
                  (seenHeaders.length ? seenHeaders : []).map((header) =>
                    header.trim()
                  )
                )
              ).filter((header) => header.length > 0);

              const sampleRows = sampleRowsRef.current.slice(0, 100);
              const fallbackMappings = buildFallbackMappings(uniqueHeaders, sampleRows);

              setParseProgress(1);
              setCsvHeaders(uniqueHeaders);
              setCsvSampleRows(sampleRows);
              setInitialColumnMappings(deepCloneMappings(fallbackMappings));
              setColumnMappings(fallbackMappings);
              setMappingError(null);
              setParsingState("parsed");
              resolve();
            },
            error: (error) => {
              reject(error);
            },
          });
        });
      } catch (error) {
        console.error("Failed to parse file", error);
        if (!isCancelled) {
          toast.error("Failed to parse the uploaded file");
          setParsingState("error");
          setParseProgress(0);
          setColumnMappings([]);
          setInitialColumnMappings([]);
          setCsvHeaders([]);
          setCsvSampleRows([]);
          setMappingStage("summary");
          setEditingState(null);
          setIsAnalyzing(false);
          setMappingError("Field mapping analysis failed");
          sampleRowsRef.current = [];
          headersRef.current = [];
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          setFile(null);
        }
      }
    }

    parseSelectedFile();

    return () => {
      isCancelled = true;
    };
  }, [file]);

  const mappingFieldDefinitions = useMemo<MappingContactField[]>(() => {
    return contactFields.map(({ id, label, type, core }) => ({
      id,
      label,
      type,
      core,
    }));
  }, [contactFields]);

  useEffect(() => {
    if (!open || parsingState !== "parsed") {
      return;
    }

    if (!csvHeaders.length) {
      setColumnMappings([]);
      return;
    }

    if (!mappingFieldDefinitions.length) {
      if (!fieldsLoading) {
        setMappingError("Contact fields are not available");
      }
      return;
    }

    let isCancelled = false;
    setIsAnalyzing(true);
    setMappingError(null);

    try {
      const mapper = new FieldMapper(mappingFieldDefinitions);
      const sampleData = csvSampleRows.slice(0, 100);
      const mappings = mapper.mapColumns(csvHeaders, sampleData);
      if (!isCancelled) {
        const initialMappings = deepCloneMappings(mappings);
        setInitialColumnMappings(initialMappings);
        setColumnMappings((previous) => {
          if (!previous.length) {
            return mappings;
          }

          return mappings.map((mapping) => {
            const previousMapping = previous.find(
              (item) =>
                item.csvColumn === mapping.csvColumn &&
                item.csvIndex === mapping.csvIndex
            );

            if (!previousMapping) {
              return mapping;
            }

            if (!previousMapping.selectedField) {
              return mapping;
            }

            return {
              ...mapping,
              selectedField: previousMapping.selectedField,
              isCustomField: previousMapping.isCustomField,
            };
          });
        });
      }
    } catch (error) {
      console.error("Field mapping analysis failed", error);
      if (!isCancelled) {
        setMappingError("Field mapping analysis failed");
        const fallback = buildFallbackMappings(csvHeaders, csvSampleRows);
        setInitialColumnMappings(deepCloneMappings(fallback));
        setColumnMappings(fallback);
      }
    } finally {
      if (!isCancelled) {
        setIsAnalyzing(false);
      }
    }

    return () => {
      isCancelled = true;
    };
  }, [
    csvHeaders,
    csvSampleRows,
    fieldsLoading,
    mappingFieldDefinitions,
    open,
    parsingState,
  ]);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleMappingChange = useCallback(
    (csvIndex: number, systemFieldId: string | null) => {
      setColumnMappings((previous) =>
        previous.map((mapping) => {
          if (mapping.csvIndex !== csvIndex) {
            return mapping;
          }

          if (!systemFieldId) {
            const fallbackIsCustom =
              mapping.suggestedMatches.length === 0 ||
              (mapping.suggestedMatches[0]?.score ?? 0) < 40;

            return {
              ...mapping,
              selectedField: null,
              isCustomField: fallbackIsCustom,
            };
          }

          return {
            ...mapping,
            selectedField: systemFieldId,
            isCustomField: false,
          };
        })
      );
    },
    []
  );

  const handleCreateCustomField = useCallback(
    async (columnName: string, csvIndex: number) => {
      try {
        const response = await fetch("/api/contact-fields", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: columnName,
            type: "text",
            core: false,
          }),
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        const candidate =
          (payload?.field as RawContactField | undefined) ??
          (payload as RawContactField | undefined);
        const normalized = normalizeContactField(candidate);

        if (!normalized) {
          throw new Error("Invalid custom field payload");
        }

        setContactFields((previous) => {
          if (previous.some((field) => field.id === normalized.id)) {
            return previous;
          }
          return [...previous, normalized];
        });

        setColumnMappings((previous) =>
          previous.map((mapping) =>
            mapping.csvColumn === columnName
              ? {
                  ...mapping,
                  selectedField: normalized.id,
                  isCustomField: false,
                }
              : mapping
          )
        );

        setEditingState((current) =>
          current && current.csvIndex === csvIndex
            ? { csvIndex, draftFieldId: normalized.id }
            : current
        );

        toast.success(`Created custom field "${normalized.label}"`);
      } catch (error) {
        console.error("Failed to create custom field", error);
        toast.error("Failed to create custom field");
      }
    },
    []
  );

  const startEditing = useCallback(
    (csvIndex: number) => {
      const mapping = columnMappings.find((item) => item.csvIndex === csvIndex);
      if (!mapping) {
        return;
      }

      setEditingState({
        csvIndex,
        draftFieldId: mapping.selectedField ?? null,
      });
    },
    [columnMappings]
  );

  const cancelEditing = useCallback(() => {
    setEditingState(null);
  }, []);

  const updateEditingDraft = useCallback((fieldId: string | null) => {
    setEditingState((current) =>
      current ? { ...current, draftFieldId: fieldId } : current
    );
  }, []);

  const confirmEditing = useCallback(() => {
    if (!editingState) {
      return;
    }
    handleMappingChange(editingState.csvIndex, editingState.draftFieldId);
    setEditingState(null);
  }, [editingState, handleMappingChange]);

  const handleResetMapping = useCallback(
    (csvIndex: number) => {
      const original = initialColumnMappings.find(
        (item) => item.csvIndex === csvIndex
      );
      if (!original) {
        return;
      }

      setColumnMappings((previous) =>
        previous.map((mapping) =>
          mapping.csvIndex === csvIndex ? cloneMapping(original) : mapping
        )
      );

      setEditingState((current) =>
        current && current.csvIndex === csvIndex
          ? { csvIndex, draftFieldId: original.selectedField ?? null }
          : current
      );
    },
    [initialColumnMappings]
  );

  const handleResetAllMappings = useCallback(() => {
    if (!initialColumnMappings.length) {
      return;
    }

    setColumnMappings(deepCloneMappings(initialColumnMappings));
    setEditingState(null);
  }, [initialColumnMappings]);

  const handleNextClick = useCallback(() => {
    if (parsingState !== "parsed") {
      return;
    }

    if (mappingStage === "summary") {
      setEditingState(null);
      setMappingStage("detailed");
      return;
    }

    // Placeholder for wizard progression - integrate with submission flow later.
  }, [mappingStage, parsingState]);

  const handlePreviousClick = useCallback(() => {
    if (!file) {
      return;
    }

    if (mappingStage === "detailed") {
      setEditingState(null);
      setMappingStage("summary");
      return;
    }

    reset();
  }, [file, mappingStage, reset]);

  const renderSummaryRow = (mapping: ColumnMapping) => {
    const targetField = mapping.selectedField
      ? contactFields.find((field) => field.id === mapping.selectedField)
      : null;
    const selectedMatch = mapping.selectedField
      ? mapping.suggestedMatches.find(
          (match) => match.systemFieldId === mapping.selectedField
        )
      : null;
    const displayMatch = selectedMatch ?? mapping.suggestedMatches[0];
    const score = displayMatch?.score ?? 0;
    const confidence = displayMatch?.confidence ?? "low";
    const { badgeClass, label: confidenceLabel } = getConfidenceStyles(confidence);
    const samplePreview = mapping.sampleData
      .filter((value) => value && value.length > 0)
      .slice(0, 3);
    const fieldLabel =
      targetField?.label ?? displayMatch?.systemFieldLabel ?? "Not mapped yet";
    const reason = displayMatch?.matchReason ?? "Manual review recommended";
    const manualReview = confidence === "low" || !displayMatch || !fieldLabel;

    return (
      <div
        key={`${mapping.csvColumn}-${mapping.csvIndex}-summary`}
        className={cn(
          "rounded-2xl border bg-white/90 px-5 py-4 shadow-sm transition hover:border-primary/30",
          manualReview ? "border-amber-400/40" : "border-muted-foreground/20"
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                badgeClass
              )}
            >
              {`${score}% - ${confidenceLabel}`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            <span>{mapping.csvColumn}</span>
            <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-primary">{fieldLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wide text-[11px]">
              Sample
            </span>
            {samplePreview.length ? (
              samplePreview.map((sample) => (
                <span
                  key={`${mapping.csvColumn}-summary-sample-${sample}`}
                  className="rounded-full bg-muted px-2 py-1"
                >
                  {sample}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground/70">No data detected</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{reason}</p>
          {mapping.isCustomField && !mapping.selectedField ? (
            <button
              type="button"
              onClick={() => handleCreateCustomField(mapping.csvColumn, mapping.csvIndex)}
              className="text-sm font-medium text-primary transition hover:underline"
            >
              + Create as custom field
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  const renderDetailedRow = (mapping: ColumnMapping) => {
    const targetField = mapping.selectedField
      ? contactFields.find((field) => field.id === mapping.selectedField)
      : null;
    const selectedMatch = mapping.selectedField
      ? mapping.suggestedMatches.find(
          (match) => match.systemFieldId === mapping.selectedField
        )
      : null;
    const displayMatch = selectedMatch ?? mapping.suggestedMatches[0];
    const score = displayMatch?.score ?? 0;
    const confidence = displayMatch?.confidence ?? "low";
    const { badgeClass, label: confidenceLabel } = getConfidenceStyles(confidence);
    const samplePreview = mapping.sampleData
      .filter((value) => value && value.length > 0)
      .slice(0, 3);
    const isEditing = editingState?.csvIndex === mapping.csvIndex;
    const draftFieldId = isEditing
      ? editingState?.draftFieldId ?? null
      : mapping.selectedField ?? null;
    const displayFieldLabel = mapping.selectedField
      ? targetField?.label ?? "Unknown field"
      : displayMatch?.systemFieldLabel ?? "Not mapped";
    const fieldMeta = mapping.selectedField ? formatFieldMeta(targetField) : "No field selected";
    const manualReview =
      (displayMatch && displayMatch.confidence === "low") ||
      (!mapping.selectedField && !displayMatch);
    const duplicateCount = mapping.selectedField
      ? selectedFieldCounts.get(mapping.selectedField) ?? 0
      : 0;
    const hasDuplicate = duplicateCount > 1;

    return (
      <div
        key={`${mapping.csvColumn}-${mapping.csvIndex}-detailed`}
        className={cn(
          "rounded-2xl border bg-white/90 px-5 py-5 shadow-sm transition",
          manualReview ? "border-destructive/40 bg-destructive/5" : "border-muted-foreground/20 hover:border-primary/30"
        )}
      >
        <div className="flex flex-col gap-5 md:flex-row md:justify-between">
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
              <span className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 px-3 py-1 text-indigo-600">
                Database Field
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold capitalize",
                  badgeClass
                )}
              >
                {`${score}% - ${confidenceLabel}`}
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground">{mapping.csvColumn}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wide text-[11px]">
                Sample
              </span>
              {samplePreview.length ? (
                samplePreview.map((sample) => (
                  <span
                    key={`${mapping.csvColumn}-detailed-sample-${sample}`}
                    className="rounded-full bg-muted px-2 py-1"
                  >
                    {sample}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground/70">No data detected</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {displayMatch?.matchReason ?? "Manual review recommended"}
            </p>
          </div>
          <div className="w-full max-w-xs space-y-3 md:w-80">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                CRM Field
              </span>
              {isEditing ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <button
                    type="button"
                    onClick={confirmEditing}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-primary transition hover:bg-primary/20"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-muted-foreground transition hover:bg-muted/80"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => handleResetMapping(mapping.csvIndex)}
                    className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/40 px-2 py-1 transition hover:border-primary/50 hover:text-primary"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditing(mapping.csvIndex)}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/30 px-2 py-1 text-primary transition hover:border-primary hover:bg-primary/10"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </button>
                </div>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-3">
                <select
                  value={draftFieldId ?? ""}
                  onChange={(event) => updateEditingDraft(event.target.value ? event.target.value : null)}
                  className="w-full rounded-lg border border-muted-foreground/30 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">-- Select Field --</option>
                  {mapping.suggestedMatches.length > 0 ? (
                    <optgroup label="Suggested Matches">
                      {mapping.suggestedMatches.map((match) => {
                        const disabled =
                          (selectedFieldCounts.get(match.systemFieldId) ?? 0) > 0 &&
                          mapping.selectedField !== match.systemFieldId;
                        return (
                          <option
                            key={`${mapping.csvColumn}-detailed-suggested-${match.systemFieldId}`}
                            value={match.systemFieldId}
                            disabled={disabled}
                          >
                            {match.systemFieldLabel} ({match.confidence} - {match.score}pts) - {match.matchReason}
                          </option>
                        );
                      })}
                    </optgroup>
                  ) : null}
                  <optgroup label="All Fields">
                    {contactFields.map((field) => {
                      const disabled =
                        (selectedFieldCounts.get(field.id) ?? 0) > 0 &&
                        mapping.selectedField !== field.id;
                      return (
                        <option
                          key={`${mapping.csvColumn}-detailed-all-${field.id}`}
                          value={field.id}
                          disabled={disabled}
                        >
                          {field.label}
                        </option>
                      );
                    })}
                  </optgroup>
                </select>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => updateEditingDraft(null)}
                    className="text-sm font-medium text-muted-foreground transition hover:text-destructive"
                  >
                    Don&apos;t import this field
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreateCustomField(mapping.csvColumn, mapping.csvIndex)}
                    className="text-sm font-medium text-primary transition hover:underline"
                  >
                    + Create Custom Field
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-muted-foreground/20 bg-white px-3 py-2 text-sm">
                <p className="font-semibold text-foreground">{displayFieldLabel}</p>
                <p className="mt-1 text-xs text-muted-foreground">{fieldMeta}</p>
              </div>
            )}
          </div>
        </div>
        {manualReview ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Manual review recommended
          </div>
        ) : null}
        {hasDuplicate ? (
          <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-600">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            This CRM field is mapped to multiple columns.
          </div>
        ) : null}
      </div>
    );
  };

  const selectedFieldCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const mapping of columnMappings) {
      if (mapping.selectedField) {
        counts.set(
          mapping.selectedField,
          (counts.get(mapping.selectedField) ?? 0) + 1
        );
      }
    }
    return counts;
  }, [columnMappings]);

  const detectedCount = columnMappings.length;
  const highConfidenceCount = columnMappings.filter(
    (mapping) => mapping.suggestedMatches[0]?.confidence === "high"
  ).length;
  const customFieldCount = columnMappings.filter(
    (mapping) => mapping.isCustomField
  ).length;
  const isSummaryStage = mappingStage === "summary";
  const currentStepLabel = isSummaryStage ? "Step 1 of 4" : "Step 2 of 4";
  const isParsing = parsingState === "parsing";
  const isParsed = parsingState === "parsed";
  const hasFile = Boolean(file);
  const canProceed = isParsed;
  const detectStatus: StepStatus = isParsed ? "complete" : "active";
  const mapStatus: StepStatus = isParsed ? "active" : "upcoming";
  const finalStatus: StepStatus = "upcoming";
  const progressPercent = Math.round(
    Math.max(0, Math.min(parseProgress, 1)) * 100
  );
  const progressBarWidth = Math.min(
    Math.max(progressPercent, isParsing ? 6 : progressPercent),
    100
  );

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
            <p className="text-sm font-semibold text-primary">
              Move Entry to Contact Section
            </p>
            <p className="text-xs text-muted-foreground">{currentStepLabel}</p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition hover:bg-muted"
            onClick={handleClose}
            aria-label="Minimize import modal"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="border-b bg-muted/40">
          <ol className="flex items-center justify-between px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <StepBadge label="Detect Fields" index={1} status={detectStatus} />
            <StepBadge label="Map Fields" index={2} status={mapStatus} />
            <StepBadge label="Final Checks" index={3} status={finalStatus} />
          </ol>
        </div>

        <div className="flex flex-1 flex-col justify-between gap-8 overflow-y-auto bg-gradient-to-b from-background via-background to-muted/40 px-6 py-8">
          {!hasFile ? (
            <section className="space-y-6">
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">
                  AI Column Detection
                </h2>
                <p className="text-sm text-muted-foreground">
                  Upload your spreadsheet to start analyzing columns and match
                  them with CRM fields. Accepts .csv or .xlsx up to 10MB.
                </p>
              </div>
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={onDrop}
                className={cn(
                  "group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-muted/50 px-6 py-16 text-center transition",
                  isDragging
                    ? "border-primary bg-primary/10"
                    : "border-muted-foreground/30 hover:border-primary/40 hover:bg-muted/70"
                )}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Upload className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Drag & drop your file here
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Only .csv or .xlsx files are supported
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  Browse files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  onChange={(event) => {
                    const accepted = handleFiles(event.target.files);
                    if (!accepted && event.target) {
                      event.target.value = "";
                    }
                  }}
                />
              </div>
            </section>
          ) : isParsing ? (
            <section className="space-y-8">
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">
                  Auto Detecting Field Mapping...
                </h2>
                <p className="text-sm text-muted-foreground">
                  Analyzing columns and matching with CRM fields using intelligent
                  recognition.
                </p>
              </div>
              <div className="flex flex-col items-center gap-6 rounded-2xl bg-white/80 p-10 text-center shadow-inner">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-md">
                  <Sparkles className="h-10 w-10" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    Parsing your file...
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Matching spreadsheet columns to CRM fields using intelligent
                    pattern recognition.
                  </p>
                </div>
                <div className="flex min-w-[240px] items-center gap-3 rounded-full border bg-muted/60 px-4 py-2 text-left text-xs text-muted-foreground">
                  <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate font-medium text-foreground">
                    {file?.name}
                  </span>
                </div>
                <div className="flex w-full max-w-sm items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {progressPercent}%
                  </span>
                  <div className="relative h-2 flex-1 rounded-full bg-muted">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width]"
                      style={{ width: `${progressBarWidth}%` }}
                    />
                  </div>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                </div>
              </div>
            </section>
          ) : isParsed ? (
            <section className="space-y-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold text-foreground">
                    {mappingStage === "summary" ? "Column Detection Results" : "Smart Field Mapping"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {mappingStage === "summary"
                      ? "We matched any exact column names in your file with CRM contact fields. Review the suggestions below before continuing."
                      : "Review and adjust the AI-powered field mappings below. Click \"Edit\" to update a mapping or create custom fields for unmatched columns."}
                  </p>
                </div>
                {mappingStage === "detailed" ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={handleResetAllMappings}
                      className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/40 px-3 py-1 font-semibold uppercase tracking-wide transition hover:border-primary/50 hover:text-primary"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      Reset to Default
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 px-3 py-1 font-semibold uppercase tracking-wide text-muted-foreground/70"
                      disabled
                    >
                      More Mapping Options
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <SummaryPill
                  tone="success"
                  caption={`${detectedCount} Fields Detected`}
                />
                <SummaryPill
                  tone="info"
                  caption={`${highConfidenceCount} High Confidence`}
                />
                <SummaryPill
                  tone="custom"
                  caption={`${customFieldCount} Custom Fields`}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-muted-foreground/20 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                <Paperclip className="h-4 w-4" aria-hidden="true" />
                <span className="truncate text-sm font-medium text-foreground">
                  {file?.name}
                </span>
                <button
                  type="button"
                  onClick={reset}
                  className="ml-auto inline-flex items-center rounded-full border border-muted-foreground/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary/50 hover:text-primary"
                >
                  Choose another file
                </button>
              </div>

              {fieldsLoading ? (
                <div className="flex items-center gap-2 rounded-xl border border-muted-foreground/20 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2
                    className="h-4 w-4 animate-spin text-primary"
                    aria-hidden="true"
                  />
                  Syncing CRM contact fields...
                </div>
              ) : null}

              {fieldsError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {fieldsError}
                </div>
              ) : null}

              <div className="space-y-3">
                {isAnalyzing ? (
                  <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Analyzing field mappings...
                  </div>
                ) : null}

                {mappingError ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {mappingError}
                  </div>
                ) : null}

                {columnMappings.length === 0 && !isAnalyzing && !mappingError ? (
                  <div className="rounded-2xl border border-muted-foreground/20 bg-white/80 px-6 py-10 text-center text-sm text-muted-foreground shadow-inner">
                    No columns detected in this file. Try uploading a different dataset.
                  </div>
                ) : null}

                {mappingStage === "summary"
                  ? columnMappings.map(renderSummaryRow)
                  : columnMappings.map(renderDetailedRow)}
              </div>
            </section>
          ) : (
            <section className="space-y-6">
              <div className="rounded-2xl border border-muted-foreground/20 bg-white/80 px-6 py-10 text-center shadow-inner">
                <p className="text-sm font-medium text-foreground">
                  Something went wrong while parsing this file.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Please drop the file again or try a different one.
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  Try again
                </button>
              </div>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-between border-t bg-background px-6 py-4">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button
              type="button"
            onClick={handlePreviousClick}
            className="rounded-lg border px-4 py-2 font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!hasFile}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={handleNextClick}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            disabled={!canProceed}
          >
            Next
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function collectColumnSamples(
  rows: string[][],
  columnIndex: number,
  limit = 5
): string[] {
  const samples: string[] = [];

  for (const row of rows) {
    const rawValue = row[columnIndex] ?? "";
    const value =
      typeof rawValue === "string"
        ? rawValue.trim()
        : String(rawValue ?? "").trim();

    if (!value.length) {
      continue;
    }

    if (!samples.includes(value)) {
      samples.push(value);
    }

    if (samples.length >= limit) {
      break;
    }
  }

  return samples;
}

function buildFallbackMappings(
  headers: string[],
  rows: string[][]
): ColumnMapping[] {
  return headers.map((header, index) => ({
    csvColumn: header,
    csvIndex: index,
    selectedField: null,
    suggestedMatches: [],
    isCustomField: true,
    sampleData: collectColumnSamples(rows, index),
  }));
}

const FIELD_TYPE_LABELS: Record<ContactFieldType, string> = {
  text: "Text",
  number: "Number",
  phone: "Phone",
  email: "Email",
  datetime: "Date/Time",
};

function formatFieldMeta(field?: ContactFieldWithMeta | null): string {
  if (!field) {
    return "No field selected";
  }

  const typeLabel = FIELD_TYPE_LABELS[field.type] ?? "Text";
  const roleLabel = field.core ? "Core Field" : "Custom Field";
  return `${roleLabel} - ${typeLabel}`;
}

function getConfidenceStyles(confidence: "high" | "medium" | "low"): {
  badgeClass: string;
  label: string;
} {
  switch (confidence) {
    case "high":
      return {
        badgeClass: "bg-emerald-500/10 text-emerald-600",
        label: "High",
      };
    case "medium":
      return {
        badgeClass: "bg-amber-500/10 text-amber-600",
        label: "Medium",
      };
    default:
      return {
        badgeClass: "bg-slate-500/10 text-slate-600",
        label: "Low",
      };
  }
}

function cloneMapping(mapping: ColumnMapping): ColumnMapping {
  return {
    ...mapping,
    suggestedMatches: mapping.suggestedMatches.map((match) => ({ ...match })),
    sampleData: [...mapping.sampleData],
  };
}

function deepCloneMappings(mappings: ColumnMapping[]): ColumnMapping[] {
  return mappings.map(cloneMapping);
}

type SummaryPillProps = {
  tone: "success" | "info" | "custom";
  caption: string;
};

function SummaryPill({ tone, caption }: SummaryPillProps) {
  const toneClasses: Record<SummaryPillProps["tone"], string> = {
    success: "bg-emerald-500/10 text-emerald-600",
    info: "bg-indigo-500/10 text-indigo-600",
    custom: "bg-pink-500/10 text-pink-600",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-wide",
        toneClasses[tone]
      )}
    >
      {caption}
    </span>
  );
}

function StepBadge({
  label,
  index,
  status,
}: {
  label: string;
  index: number;
  status: StepStatus;
}) {
  const isComplete = status === "complete";
  const isActive = status === "active";

  return (
    <li
      className={cn(
        "flex min-w-[120px] flex-1 items-center gap-3 rounded-full px-3 py-2 transition",
        isComplete
          ? "bg-emerald-500/10 text-emerald-600"
          : isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold",
          isComplete
            ? "border-emerald-500 bg-emerald-500 text-white"
            : isActive
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/30 bg-background"
        )}
      >
        {isComplete ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          index
        )}
      </span>
      <span className="text-left text-[11px] font-semibold uppercase tracking-wide">
        {label}
      </span>
    </li>
  );
}
