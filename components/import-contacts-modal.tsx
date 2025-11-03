"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Link2,
  Loader2,
  Minus,
  Paperclip,
  Sparkles,
  Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import type { ParseResult } from "papaparse";

type ColumnInfo = {
  header: string;
  samples: string[];
};

type ContactField = {
  id: string;
  label: string;
  core?: boolean;
  showAsColumn?: boolean;
};

type ColumnMatch = {
  column: ColumnInfo;
  matchedField: ContactField | null;
  confidence: number;
};

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
  const [parsedColumns, setParsedColumns] = useState<ColumnInfo[]>([]);
  const [contactFields, setContactFields] = useState<ContactField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const collectedSamplesRef = useRef<Map<string, string[]>>(new Map());
  const headersRef = useRef<string[]>([]);

  const COMPANY_ID = process.env.NEXT_PUBLIC_FIREBASE_COMPANY_ID;

  const reset = useCallback(() => {
    setFile(null);
    setIsDragging(false);
    setParsingState("idle");
    setParseProgress(0);
    setParsedColumns([]);
    collectedSamplesRef.current = new Map();
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

    if (!COMPANY_ID) {
      setFieldsError("Missing company configuration");
      setContactFields([]);
      return;
    }

    let isCancelled = false;

    async function loadContactFields() {
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
          fields?: Partial<ContactField>[];
        };

        const normalized =
          payload.fields
            ?.map((field) => {
              const id = typeof field.id === "string" ? field.id : "";
              if (!id) {
                return null;
              }
              const label =
                typeof field.label === "string" && field.label.length
                  ? field.label
                  : id;
              return {
                id,
                label,
                core: Boolean(field.core),
                showAsColumn: Boolean(field.showAsColumn),
              } satisfies ContactField;
            })
            .filter(Boolean) ?? [];

        if (!isCancelled) {
          setContactFields(normalized as ContactField[]);
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
      setParsedColumns([]);
      collectedSamplesRef.current = new Map();
      headersRef.current = [];
      return;
    }

    let isCancelled = false;
    collectedSamplesRef.current = new Map();
    headersRef.current = [];

    async function parseSelectedFile() {
      setParsingState("parsing");
      setParseProgress(0);
      try {
        const PapaModule = await import("papaparse");
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
                ? results.meta?.fields.filter(
                    (field): field is string =>
                      typeof field === "string" && field.trim().length > 0
                  )
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

                const entries = Object.entries(row);
                for (const [header, value] of entries) {
                  if (typeof header !== "string" || !header.trim().length) {
                    continue;
                  }

                  const normalizedHeader = header.trim();
                  if (!headersRef.current.includes(normalizedHeader)) {
                    headersRef.current.push(normalizedHeader);
                  }

                  if (value === null || value === undefined) {
                    continue;
                  }

                  const valueString =
                    typeof value === "string"
                      ? value.trim()
                      : String(value).trim();

                  if (!valueString) {
                    continue;
                  }

                  const existingSamples =
                    collectedSamplesRef.current.get(normalizedHeader) ?? [];

                  if (existingSamples.length >= 3) {
                    continue;
                  }

                  if (!existingSamples.includes(valueString)) {
                    collectedSamplesRef.current.set(normalizedHeader, [
                      ...existingSamples,
                      valueString,
                    ]);
                  }
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
              const metaFields = Array.isArray(rawMetaFields)
                ? rawMetaFields.filter(
                    (field): field is string =>
                      typeof field === "string" && field.trim().length > 0
                  )
                : [];

              const seenHeaders = metaFields.length
                ? metaFields
                : headersRef.current;

              const uniqueHeaders = Array.from(
                new Set(
                  (seenHeaders.length
                    ? seenHeaders
                    : Array.from(collectedSamplesRef.current.keys())
                  ).map((header) => header.trim())
                )
              ).filter((header) => header.length > 0);

              const columns: ColumnInfo[] = uniqueHeaders.map((header) => ({
                header,
                samples: (
                  collectedSamplesRef.current.get(header) ??
                  collectedSamplesRef.current.get(header.trim()) ??
                  []
                ).slice(0, 3),
              }));

              setParseProgress(1);
              setParsedColumns(columns);
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
          setParsedColumns([]);
          collectedSamplesRef.current = new Map();
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

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  const columnMatches = useMemo<ColumnMatch[]>(() => {
    if (!parsedColumns.length) {
      return [];
    }

    const lookup = new Map<string, ContactField>();
    for (const field of contactFields) {
      const idKey = typeof field.id === "string" ? field.id.trim().toLowerCase() : "";
      if (idKey) {
        lookup.set(idKey, field);
      }

      const labelKey =
        typeof field.label === "string"
          ? field.label.trim().toLowerCase()
          : "";
      if (labelKey && !lookup.has(labelKey)) {
        lookup.set(labelKey, field);
      }
    }

    return parsedColumns.map((column) => {
      const normalizedHeader = column.header.trim().toLowerCase();
      const matchedField = lookup.get(normalizedHeader) ?? null;
      return {
        column,
        matchedField,
        confidence: matchedField ? 1 : 0,
      };
    });
  }, [contactFields, parsedColumns]);

  const detectedCount = parsedColumns.length;
  const highConfidenceCount = columnMatches.filter(
    (match) => match.matchedField && match.confidence >= 1
  ).length;
  const customFieldCount = Math.max(detectedCount - highConfidenceCount, 0);
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
    >
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl">
        <header className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-primary">
              Move Entry to Contact Section
            </p>
            <p className="text-xs text-muted-foreground">Step 1 of 4</p>
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
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">
                  Column Detection Results
                </h2>
                <p className="text-sm text-muted-foreground">
                  We matched any exact column names in your file with CRM contact
                  fields. Review the suggestions below before continuing.
                </p>
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
                {columnMatches.length === 0 ? (
                  <div className="rounded-2xl border border-muted-foreground/20 bg-white/80 px-6 py-10 text-center text-sm text-muted-foreground shadow-inner">
                    No columns detected in this file. Try uploading a different
                    dataset.
                  </div>
                ) : (
                  columnMatches.map(({ column, matchedField, confidence }) => {
                    const confidencePercent = Math.round(confidence * 100);
                    const confidenceTone = matchedField
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-amber-500/10 text-amber-600";

                    return (
                      <div
                        key={column.header}
                        className="rounded-2xl border border-muted-foreground/20 bg-white/90 px-5 py-4 shadow-sm transition hover:border-primary/30"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "inline-flex h-12 w-12 items-center justify-center rounded-xl text-sm font-semibold",
                                confidenceTone
                              )}
                            >
                              {confidencePercent}%
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {column.header}
                              </p>
                              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Sample
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {column.samples.length ? (
                                  column.samples.map((sample) => (
                                    <span
                                      key={`${column.header}-${sample}`}
                                      className="rounded-full bg-muted px-2 py-1"
                                    >
                                      {sample}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-muted-foreground/70">
                                    No sample values captured
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 text-right">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                              CRM Field
                            </span>
                            {matchedField ? (
                              <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                                {matchedField.label}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                                No exact match
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
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
              className="rounded-lg border px-4 py-2 font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!hasFile}
            >
              Previous
            </button>
            <button
              type="button"
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
