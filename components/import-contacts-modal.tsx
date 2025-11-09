"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  Check,
  Link2,
  Loader2,
  Minus,
  Paperclip,
  Pencil,
  RotateCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import type { ParseResult } from "papaparse";
import { FieldMapper } from "@/lib/mapping/fieldMapper";
import {
  detectAgentEmailColumn,
  objectRowsToMatrix,
} from "@/lib/mapping/agentEmailDetector";
import type {
  ColumnMapping,
  ContactField as MappingContactField,
  ContactFieldType,
} from "@/lib/mapping/types";

type ContactFieldWithMeta = MappingContactField & {
  showAsColumn?: boolean;
};

type RawContactField = Partial<ContactFieldWithMeta>;

type ImportSummary = {
  imported: number;
  merged: number;
  errors: number;
  totalRows: number;
  agentColumn?: string;
  errorReasons: string[];
};

const VALID_FIELD_TYPES: ContactFieldType[] = [
  "text",
  "number",
  "phone",
  "email",
  "datetime",
];

const CORE_FIELD_ORDER = ["firstName", "lastName", "phone", "email"];

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

export function ImportContactsModal({
  open,
  onClose,
}: ImportContactsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsingState, setParsingState] = useState<
    "idle" | "parsing" | "parsed" | "error"
  >("idle");
  const [parseProgress, setParseProgress] = useState(0);
  const [contactFields, setContactFields] = useState<ContactFieldWithMeta[]>(
    []
  );
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [initialColumnMappings, setInitialColumnMappings] = useState<
    ColumnMapping[]
  >([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvSampleRows, setCsvSampleRows] = useState<string[][]>([]);
  const [mappingStage, setMappingStage] = useState<
    "summary" | "detailed" | "finalChecks"
  >("summary");
  const [editingState, setEditingState] = useState<{
    csvIndex: number;
    draftFieldId: string | null;
  } | null>(null);
  const [openFieldPickerIndex, setOpenFieldPickerIndex] = useState<
    number | null
  >(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(
    null
  );
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sampleRowsRef = useRef<string[][]>([]);
  const headersRef = useRef<string[]>([]);
  const parsedRowsRef = useRef<Record<string, string>[]>([]);
  const fieldPickerContainerRef = useRef<HTMLDivElement | null>(null);

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
    setIsImporting(false);
    setImportSummary(null);
    setImportError(null);
    sampleRowsRef.current = [];
    headersRef.current = [];
    parsedRowsRef.current = [];
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
            .filter((field): field is ContactFieldWithMeta => Boolean(field)) ??
          [];

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

  useEffect(() => {
    if (!editingState) {
      setOpenFieldPickerIndex(null);
    }
  }, [editingState]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        openFieldPickerIndex !== null &&
        fieldPickerContainerRef.current &&
        !fieldPickerContainerRef.current.contains(event.target as Node)
      ) {
        setOpenFieldPickerIndex(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openFieldPickerIndex]);

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

    if (allowedTypes.includes(nextFile.type) || matchesExtension) {
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
       setIsImporting(false);
       setImportSummary(null);
       setImportError(null);
      sampleRowsRef.current = [];
      headersRef.current = [];
      parsedRowsRef.current = [];
      return;
    }

    let isCancelled = false;
    sampleRowsRef.current = [];
    headersRef.current = [];
    parsedRowsRef.current = [];

    async function parseSelectedFile() {
      setParsingState("parsing");
      setParseProgress(0);
      try {
        const PapaModule = await import("papaparse"); // dynamic import for smaller bundle size as we only need this during parsing
        const Papa = (PapaModule.default ??
          PapaModule) as typeof import("papaparse");

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

              const hasAnyValue = Object.values(rowValues).some(
                (value) => value.length > 0
              );

              if (!hasAnyValue) {
                continue;
              }

              parsedRowsRef.current.push(rowValues);

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
                const nextProgress = Math.min(
                  0.99,
                  Math.max(0, cursor / file.size)
                );
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
              const fallbackMappings = buildFallbackMappings(
                uniqueHeaders,
                sampleRows
              );

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
          parsedRowsRef.current = [];
          setIsImporting(false);
          setImportSummary(null);
          setImportError(null);
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

  const { coreFields, crmFields } = useMemo(() => {
    const coreList = contactFields
      .filter((field) => field.core)
      .sort((fieldA, fieldB) => {
        const indexA = CORE_FIELD_ORDER.indexOf(fieldA.id);
        const indexB = CORE_FIELD_ORDER.indexOf(fieldB.id);

        if (indexA === -1 && indexB === -1) {
          return fieldA.label.localeCompare(fieldB.label);
        }
        if (indexA === -1) {
          return 1;
        }
        if (indexB === -1) {
          return -1;
        }
        return indexA - indexB;
      });

    const crmList = contactFields
      .filter((field) => !field.core)
      .sort((fieldA, fieldB) => fieldA.label.localeCompare(fieldB.label));

    return { coreFields: coreList, crmFields: crmList };
  }, [contactFields]);

  const agentEmailCandidate = useMemo(() => {
    if (!csvHeaders.length || !csvSampleRows.length) {
      return null;
    }
    return detectAgentEmailColumn(csvHeaders, csvSampleRows);
  }, [csvHeaders, csvSampleRows]);

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
      const resolvedMappings = resolveDuplicateSuggestions(mappings);
      if (!isCancelled) {
        const initialMappings = deepCloneMappings(resolvedMappings);
        setInitialColumnMappings(initialMappings);
        setColumnMappings((previous) => {
          if (!previous.length) {
            return resolvedMappings;
          }

          return resolvedMappings.map((mapping) => {
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

  const runImport = useCallback(async () => {
    if (isImporting) {
      return;
    }

    if (!COMPANY_ID) {
      const message = "Missing company configuration.";
      setImportError(message);
      toast.error(message);
      return;
    }

    if (!csvHeaders.length) {
      const message = "No headers detected in this file.";
      setImportError(message);
      toast.error(message);
      return;
    }

    if (!parsedRowsRef.current.length) {
      const message = "No data rows detected in this file.";
      setImportError(message);
      toast.error(message);
      return;
    }

    const mappedColumns = columnMappings
      .filter((mapping) => Boolean(mapping.selectedField))
      .map((mapping) => ({
        csvColumn: mapping.csvColumn,
        fieldId: mapping.selectedField as string,
      }));

    if (!mappedColumns.length) {
      const message = "Map at least one CRM field before continuing.";
      setImportError(message);
      toast.error(message);
      return;
    }

    const matrixSource =
      parsedRowsRef.current.length > 0
        ? objectRowsToMatrix(
            csvHeaders,
            parsedRowsRef.current.slice(0, 200)
          )
        : csvSampleRows;

    let detectionResult =
      detectAgentEmailColumn(csvHeaders, matrixSource) ?? null;

    if (!detectionResult && agentEmailCandidate) {
      detectionResult = agentEmailCandidate;
    }

    if (!detectionResult) {
      const message =
        "We couldn't detect any agent email column in this file.";
      setImportError(message);
      toast.error(message);
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportSummary(null);

    try {
      const response = await fetch(
        `/api/contacts/import?companyId=${encodeURIComponent(
          COMPANY_ID
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            headers: csvHeaders,
            mappings: mappedColumns,
            rows: parsedRowsRef.current,
            agentColumn: detectionResult.header,
          }),
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | {
            imported?: number;
            merged?: number;
            errors?: number;
            agentColumn?: string;
            errorReasons?: unknown;
            error?: string;
            message?: string;
          }
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Failed to import contacts");
      }

      const responseAgentColumn =
        typeof payload.agentColumn === "string" &&
        payload.agentColumn.trim().length
          ? payload.agentColumn.trim()
          : detectionResult.header;

      setImportSummary({
        imported: payload.imported ?? 0,
        merged: payload.merged ?? 0,
        errors: payload.errors ?? 0,
        totalRows: parsedRowsRef.current.length,
        agentColumn: responseAgentColumn,
        errorReasons:
          Array.isArray(payload.errorReasons) && payload.errorReasons.length
            ? payload.errorReasons.filter(
                (reason): reason is string =>
                  typeof reason === "string" && reason.trim().length > 0
              )
            : [],
      });
      setMappingStage("finalChecks");
      toast.success(
        `Imported ${payload.imported ?? 0} contact${
          (payload.imported ?? 0) === 1 ? "" : "s"
        }`
      );
    } catch (error) {
      console.error("Failed to import contacts", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to import contacts";
      setImportError(message);
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  }, [
    COMPANY_ID,
    agentEmailCandidate,
    columnMappings,
    csvHeaders,
    csvSampleRows,
    isImporting,
  ]);

  const handleNextClick = useCallback(async () => {
    if (parsingState !== "parsed") {
      return;
    }

    if (mappingStage === "summary") {
      setEditingState(null);
      setMappingStage("detailed");
      return;
    }

    if (mappingStage === "detailed") {
      await runImport();
      return;
    }

    if (mappingStage === "finalChecks") {
      handleClose();
    }
  }, [handleClose, mappingStage, parsingState, runImport]);

  const handlePreviousClick = useCallback(() => {
    if (!file) {
      return;
    }

    if (mappingStage === "finalChecks") {
      setMappingStage("detailed");
      setImportSummary(null);
      setImportError(null);
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
    const { badgeClass, label: confidenceLabel } =
      getConfidenceStyles(confidence);
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
        <div className="flex  gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-md ring-green-200 ring px-3 py-1 text-xs font-semibold",
                badgeClass
              )}
            >
              {`${score}% - ${confidenceLabel}`}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
              <span>{mapping.csvColumn}</span>
              <Link2 className="h-4 w-4 text-blue-500" aria-hidden="true" />
              <span className="  text-blue-500">{fieldLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold camelcase tracking-wide text-[11px]">
                Sample
              </span>
              {samplePreview.length ? (
                samplePreview.map((sample, sampleIndex) => (
                  <span
                    key={`${mapping.csvColumn}-summary-sample-${sampleIndex}`}
                    className="rounded-sm bg-muted px-2 py-1 text-[11px]"
                  >
                    {sample}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground/70">
                  No data detected
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{reason}</p>
          </div>
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
    const { badgeClass, label: confidenceLabel } =
      getConfidenceStyles(confidence);
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
    const fieldMeta = mapping.selectedField
      ? formatFieldMeta(targetField)
      : "No field selected";
    const manualReview =
      (displayMatch && displayMatch.confidence === "low") ||
      (!mapping.selectedField && !displayMatch);
    const duplicateCount = mapping.selectedField
      ? selectedFieldCounts.get(mapping.selectedField) ?? 0
      : 0;
    const hasDuplicate = duplicateCount > 1;
    const draftField =
      draftFieldId && contactFields.length
        ? contactFields.find((field) => field.id === draftFieldId) ?? null
        : null;
    const draftFieldLabel = draftField?.label ?? "Select CRM field";
    const draftFieldMeta = draftField
      ? `${draftField.core ? "Core" : "CRM"} • ${draftField.type}`
      : "Choose where to map this column";
    const isPickerOpen = openFieldPickerIndex === mapping.csvIndex;
    const handleFieldSelection = (fieldId: string | null) => {
      updateEditingDraft(fieldId);
      setOpenFieldPickerIndex(null);
    };
    const toggleFieldPicker = () => {
      setOpenFieldPickerIndex((current) =>
        current === mapping.csvIndex ? null : mapping.csvIndex
      );
    };
    const isFieldDisabled = (fieldId: string) =>
      (selectedFieldCounts.get(fieldId) ?? 0) > 0 &&
      mapping.selectedField !== fieldId;
    const renderFieldOption = (field: ContactFieldWithMeta) => {
      const disabled = isFieldDisabled(field.id);
      const isSelectedField = draftFieldId === field.id;

      return (
        <button
          key={`${mapping.csvColumn}-picker-${field.id}`}
          type="button"
          disabled={disabled}
          onClick={() => handleFieldSelection(field.id)}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-xl px-4 py-2 text-left transition",
            disabled
              ? "cursor-not-allowed opacity-40"
              : "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
            isSelectedField && !disabled
              ? "bg-primary/5 text-primary"
              : "text-foreground"
          )}
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold tracking-tight">
              {field.label}
            </span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {isSelectedField ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                Current
                <Check className="h-3 w-3" aria-hidden="true" />
              </span>
            ) : null}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {field.id}
            </span>
          </div>
        </button>
      );
    };

    return (
      <div
        key={`${mapping.csvColumn}-${mapping.csvIndex}-detailed`}
        className={cn(
          "rounded-2xl border bg-white px-5 py-5 transition ring-1 ring-transparent",
          manualReview
            ? "border-destructive/15 ring-destructive/15 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
            : "border-muted-foreground/20 shadow-sm hover:border-primary/30"
        )}
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-stretch md:gap-8">
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">
              <span className="inline-flex items-center gap-2 rounded-sm bg-purple-500/10 px-1.5 py-1 text-purple-500 ring-purple-500/50 ring">
                Database Field
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-sm px-1.5 py-1 text-[10px] font-semibold capitalize ring-green-500/50 ring",
                  badgeClass
                )}
              >
                {`${score}% - ${confidenceLabel}`}
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {mapping.csvColumn}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold camelcase tracking-wide text-[11px]">
                Sample
              </span>
              {samplePreview.length ? (
                samplePreview.map((sample, sampleIndex) => (
                  <span
                    key={`${mapping.csvColumn}-detailed-sample-${sampleIndex}`}
                    className="rounded-sm bg-muted px-1.5 py-1 text-[11px]"
                  >
                    {sample}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground/70">
                  No data detected
                </span>
              )}
            </div>
          </div>
          <div className="flex items-start justify-center md:justify-start">
            <span className="flex h-11 w-11 items-start justify-center     text-blue-400  ">
              <Link2 className="h-6 w-6" aria-hidden="true" />
              <span className="sr-only">Linked mapping</span>
            </span>
          </div>
          <div className="w-full md:max-w-sm">
            <div className="rounded-2xl  px-4    ">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="inline-flex items-center gap-1 rounded-sm bg-blue-200 ring ring-blue-300 text-blue-500 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide  ">
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
                      className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-1 text-muted-foreground transition hover:bg-white"
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
                      className="inline-flex items-center gap-1 px-2 py-1 transition hover:text-primary"
                    >
                      <RotateCw className="h-3 w-3" aria-hidden="true" />
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditing(mapping.csvIndex)}
                      className="inline-flex items-center gap-1 px-2 py-1 transition hover:text-primary"
                    >
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                      Edit
                    </button>
                  </div>
                )}
              </div>
              {isEditing ? (
                <div className="mt-4 space-y-3" ref={fieldPickerContainerRef}>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={toggleFieldPicker}
                      className={cn(
                        "flex w-50 items-center justify-between rounded-md border border-blue-300 bg-white px-2 py-1.5 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                        isPickerOpen && "border-primary shadow-lg"
                      )}
                    >
                      <span className="text-xs  text-foreground">
                        {draftFieldLabel}
                      </span>

                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition",
                          isPickerOpen && "rotate-180 text-primary"
                        )}
                        aria-hidden="true"
                      />
                    </button>
                    {isPickerOpen ? (
                      <div className="absolute left-0 z-30 mt-2 w-full overflow-hidden rounded-md border border-muted-foreground/20 bg-white shadow-2xl">
                        <div className="space-y-1 border-b border-muted-foreground/10 bg-muted/20 px-2 py-3">
                          <button
                            type="button"
                            onClick={() => handleFieldSelection(null)}
                            className="flex w-full items-center gap-2   px-3   text-[11px] font-semibold text-gray-500 transition hover:text-gray-700"
                          >
                            <Minus className="h-2.5 w-2.5" aria-hidden="true" />
                            Don&apos;t import this field
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenFieldPickerIndex(null);
                              handleCreateCustomField(
                                mapping.csvColumn,
                                mapping.csvIndex
                              );
                            }}
                            className="flex w-full items-center gap-2   px-3    text-[11px] font-medium text-gray-500 transition hover:text-gray-700"
                          >
                            <Sparkles
                              className="h-2.5 w-2.5"
                              aria-hidden="true"
                            />
                            Create Custom Field
                          </button>
                        </div>
                        <div className="max-h-72 overflow-y-auto py-2">
                          <div className="px-4 pb-1 text-[11px] font-semibold capitalize tracking-wide text-blue-500">
                            Core Fields
                          </div>
                          {coreFields.length ? (
                            coreFields.map((field) => renderFieldOption(field))
                          ) : (
                            <p className="px-4 pb-2 text-xs text-muted-foreground">
                              No core fields available
                            </p>
                          )}
                          <div className="px-4 pb-1 pt-3 text-[11px] border-t border-muted-foreground/10 font-semibold capitalize tracking-wide text-blue-500">
                            CRM Fields
                          </div>
                          {crmFields.length ? (
                            crmFields.map((field) => renderFieldOption(field))
                          ) : (
                            <p className="px-4 pb-2 text-xs text-muted-foreground">
                              No CRM fields available
                            </p>
                          )}
                        </div>
                        <div className="border-t border-muted-foreground/10 bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
                          Showing available CRM fields for this workspace
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {draftField
                      ? "Pick another CRM field or save your changes."
                      : "Select a CRM field to map this column."}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl   bg-white   py-1 text-sm  ">
                  <p className="font-semibold text-blue-500">
                    {displayFieldLabel}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fieldMeta}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        {manualReview ? (
          <div className="mt-5 -mx-5 -mb-5 flex items-center justify-center gap-2 rounded-b-2xl   bg-destructive/15 px-5 py-1.5 text-xs font-semibold text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Manual Review Recommended
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
  const isDetailedStage = mappingStage === "detailed";
  const isFinalStage = mappingStage === "finalChecks";
  const currentStepLabel = isFinalStage
    ? "Step 3 of 4"
    : isSummaryStage
    ? "Step 1 of 4"
    : "Step 2 of 4";
  const isParsing = parsingState === "parsing";
  const isParsed = parsingState === "parsed";
  const hasFile = Boolean(file);
  const canProceed = isFinalStage
    ? true
    : isSummaryStage
    ? isParsed
    : isParsed && !isImporting;
  const detectStatus: StepStatus =
    parsingState === "parsed" ? "complete" : "active";
  const mapStatus: StepStatus =
    !hasFile || parsingState !== "parsed"
      ? "upcoming"
      : isFinalStage
      ? "complete"
      : "active";
  const finalStatus: StepStatus = isFinalStage
    ? "active"
    : parsingState === "parsed" && hasFile
    ? "upcoming"
    : "upcoming";
  const progressPercent = Math.round(
    Math.max(0, Math.min(parseProgress, 1)) * 100
  );
  const baseProgressWidth = Math.min(
    Math.max(progressPercent, isParsing ? 6 : progressPercent),
    100
  );
  const progressBarWidth = isFinalStage ? 100 : baseProgressWidth;
  const nextButtonLabel = isFinalStage
    ? "Move to Contacts"
    : isDetailedStage
    ? isImporting
      ? "Running Final Checks..."
      : "Run Final Checks"
    : "Next";

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-[50vw] lg:max-w-[50vw] flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl"
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
          <ol className="flex items-center justify-between gap-6 px-6 py-3">
            <StepBadge
              label="Detect Fields"
              description="Review data structure"
              index={1}
              status={detectStatus}
            />
            <StepBadge
              label="Map Fields"
              description="Connect to CRM Fields"
              index={2}
              status={mapStatus}
            />
            <StepBadge
              label="Final Checks"
              description="For Duplicates and Errors"
              index={3}
              status={finalStatus}
            />
          </ol>
        </div>

        <div className="import-modal-scroll flex flex-1 flex-col justify-between gap-8 overflow-y-auto bg-gradient-to-b from-background via-background to-muted/40 px-6 py-8">
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
                  Analyzing columns and matching with CRM fields using
                  intelligent recognition.
                </p>
              </div>
              <div className="flex flex-col items-center gap-6 rounded-2xl bg-white/80 p-10 text-center ">
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
                  <Loader2
                    className="h-4 w-4 animate-spin text-primary"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </section>
        ) : isParsed ? (
          mappingStage === "finalChecks" ? (
            <section className="space-y-6">
              <div className="rounded-2xl border border-muted-foreground/20 bg-white/95 px-6 py-10 text-center shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <Check className="h-7 w-7" aria-hidden="true" />
                </div>
                <p className="mt-6 text-xl font-semibold text-[#083F6D]">
                  Final Checks Complete
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {importSummary
                    ? `No blocking errors found across ${importSummary.totalRows.toLocaleString()} row${
                        importSummary.totalRows === 1 ? "" : "s"
                      }. Your contacts are ready to move to the CRM.`
                    : "No blocking errors found. Your contacts are ready to move to the CRM."}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Contacts with unmatched agent emails were skipped automatically.
                </p>
                {importSummary ? (
                  <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    <FinalSummaryCard
                      label="Total Contacts Imported"
                      tone="success"
                      value={importSummary.imported}
                    />
                    <FinalSummaryCard
                      label="Contacts Merged"
                      tone="warning"
                      value={importSummary.merged}
                    />
                    <FinalSummaryCard
                      label="Errors"
                      tone="error"
                      value={importSummary.errors}
                      tooltipItems={importSummary.errorReasons}
                    />
                  </div>
                ) : null}
              </div>
              {importSummary?.agentColumn ? (
                <div className="text-center text-xs text-muted-foreground">
                  Matched agent ownership using column{" "}
                  <span className="font-semibold text-foreground">
                    {importSummary.agentColumn}
                  </span>
                  .
                </div>
              ) : null}
            </section>
          ) : (
            <section className="space-y-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold text-foreground">
                    {mappingStage === "summary"
                      ? "Column Detection Results"
                      : "Smart Field Mapping"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {mappingStage === "summary"
                      ? `Our intelligent mapping has mapped ${detectedCount} fields in this entry with the CRM Contact Fields`
                      : 'Review and adjust the AI-powered field mappings below. Click "Edit" next to any mapping to change it. You can map to existing CRM fields or create custom fields with different data types.'}
                  </p>
                </div>
              </div>
              {mappingStage === "detailed" ? (
                <div className="flex w-full items-center justify-end gap-2 text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={handleResetAllMappings}
                    className="inline-flex items-center gap-2 rounded-full   px-3  font-semibold camelcase tracking-wide transition hover:border-primary/50 hover:text-primary"
                  >
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="leading-none">Reset to Default</span>
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full  px-3  font-semibold camelcase tracking-wide text-muted-foreground/70"
                    disabled
                  >
                    <SlidersHorizontal
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                    <span className="leading-none">More Mapping Options</span>
                  </button>
                </div>
              ) : null}

              {mappingStage === "summary" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
              ) : null}

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

              {agentEmailCandidate ? (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-300/60 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                  <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-semibold text-emerald-700">
                      Agent column detected: {agentEmailCandidate.header}
                    </span>
                    <span>
                      Confidence ~{Math.round(agentEmailCandidate.score)}% — we&apos;ll assign agents automatically using this column.
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {isAnalyzing ? (
                  <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Analyzing field mappings...
                  </div>
                ) : null}

                {mappingError ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {mappingError}
                  </div>
                ) : null}

                {isImporting && mappingStage === "detailed" ? (
                  <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Running final checks...
                  </div>
                ) : null}

                {importError && mappingStage === "detailed" ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {importError}
                  </div>
                ) : null}

                {columnMappings.length === 0 &&
                !isAnalyzing &&
                !mappingError ? (
                  <div className="rounded-2xl border border-muted-foreground/20 bg-white/80 px-6 py-10 text-center text-sm text-muted-foreground  ">
                    No columns detected in this file. Try uploading a different
                    dataset.
                  </div>
                ) : null}

                {mappingStage === "summary"
                  ? columnMappings.map(renderSummaryRow)
                  : columnMappings.map(renderDetailedRow)}
              </div>
            </section>
          )
        ) : (
            <section className="space-y-6">
              <div className="rounded-2xl border border-muted-foreground/20 bg-white/80 px-6 py-10 text-center  ">
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
              disabled={!hasFile || isImporting}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={handleNextClick}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              disabled={!canProceed}
            >
              {isDetailedStage && isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {nextButtonLabel}
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

// Ensure only the highest scoring column keeps a primary suggestion per field.
function resolveDuplicateSuggestions(
  mappings: ColumnMapping[]
): ColumnMapping[] {
  const grouped = new Map<string, ColumnMapping[]>();

  for (const mapping of mappings) {
    const primaryMatch = mapping.suggestedMatches[0];
    if (!primaryMatch) {
      continue;
    }
    const group = grouped.get(primaryMatch.systemFieldId);
    if (group) {
      group.push(mapping);
    } else {
      grouped.set(primaryMatch.systemFieldId, [mapping]);
    }
  }

  const duplicates = Array.from(grouped.entries()).filter(
    ([, group]) => group.length > 1
  );

  if (!duplicates.length) {
    return mappings;
  }

  const winnerByField = new Map<string, number>();
  const loserIndices = new Set<number>();

  for (const [fieldId, group] of duplicates) {
    group.sort((a, b) => {
      const scoreA = a.suggestedMatches[0]?.score ?? 0;
      const scoreB = b.suggestedMatches[0]?.score ?? 0;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return a.csvIndex - b.csvIndex;
    });

    winnerByField.set(fieldId, group[0].csvIndex);
    for (const losingMapping of group.slice(1)) {
      loserIndices.add(losingMapping.csvIndex);
    }
  }

  if (!loserIndices.size) {
    return mappings;
  }

  return mappings.map((mapping) => {
    const primaryMatch = mapping.suggestedMatches[0];
    if (!primaryMatch) {
      return mapping;
    }

    const winnerIndex = winnerByField.get(primaryMatch.systemFieldId);
    if (winnerIndex === undefined) {
      return mapping;
    }

    if (mapping.csvIndex === winnerIndex) {
      if (
        primaryMatch.confidence === "high" &&
        mapping.selectedField !== primaryMatch.systemFieldId
      ) {
        return {
          ...mapping,
          selectedField: primaryMatch.systemFieldId,
        };
      }
      return mapping;
    }

    return {
      ...mapping,
      selectedField:
        mapping.selectedField === primaryMatch.systemFieldId
          ? null
          : mapping.selectedField,
      suggestedMatches: [],
      isCustomField: false,
    };
  });
}

type SummaryPillProps = {
  tone: "success" | "info" | "custom";
  caption: string;
};

function SummaryPill({ tone, caption }: SummaryPillProps) {
  const toneClasses: Record<SummaryPillProps["tone"], string> = {
    success: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
    info: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20",
    custom: "bg-pink-500/10 text-pink-600 ring-pink-500/20",
  };
  const toneIcons: Record<SummaryPillProps["tone"], LucideIcon> = {
    success: Search,
    info: Target,
    custom: Wrench,
  };
  const Icon = toneIcons[tone];

  return (
    <div
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-sm px-4 py-2 text-[11px] font-semibold uppercase tracking-wide ring",
        toneClasses[tone]
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {caption}
    </div>
  );
}

type FinalSummaryCardProps = {
  label: string;
  value: number;
  tone: "success" | "warning" | "error";
  tooltipItems?: string[];
};

function FinalSummaryCard({
  label,
  value,
  tone,
  tooltipItems = [],
}: FinalSummaryCardProps) {
  const toneClasses: Record<FinalSummaryCardProps["tone"], string> = {
    success: "border-emerald-100 bg-emerald-50 text-emerald-700",
    warning: "border-amber-100 bg-amber-50 text-amber-700",
    error: "border-rose-100 bg-rose-50 text-rose-700",
  };

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-5 text-center shadow-sm",
        toneClasses[tone]
      )}
    >
      <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-current">
        <span>{label}</span>
        {tone === "error" && tooltipItems.length ? (
          <span className="group relative inline-flex text-rose-600">
            <span className="inline-flex h-4 w-4 cursor-default items-center justify-center rounded-full border border-current text-[10px] font-bold leading-none">
              i
            </span>
            <div className="pointer-events-none absolute top-full left-1/2 z-10 mt-2 w-48 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-left text-[11px] font-medium text-slate-600 opacity-0 shadow-lg transition group-hover:opacity-100">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Errors detected
              </p>
              <ul className="list-disc space-y-1 pl-4">
                {tooltipItems.map((item, index) => (
                  <li key={`${label}-tooltip-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-3xl font-bold leading-tight">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function StepBadge({
  label,
  description,
  index,
  status,
}: {
  label: string;
  description: string;
  index: number;
  status: StepStatus;
}) {
  const isComplete = status === "complete";
  const isActive = status === "active";

  return (
    <li
      className={cn(
        "flex min-w-[140px] flex-1 items-center gap-3 rounded-2xl px-2 py-1 transition"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold transition",
          isComplete
            ? "bg-emerald-500 text-white shadow-sm"
            : isActive
            ? "bg-[#083F6D] text-white shadow-sm"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isComplete ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          index
        )}
      </span>
      <span className="flex flex-col text-left leading-tight">
        <span
          className={cn(
            "text-sm font-semibold",
            isActive
              ? "text-[#083F6D]"
              : isComplete
              ? "text-foreground"
              : "text-muted-foreground"
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "text-xs font-medium text-muted-foreground",
            isActive && "text-[#3D5B7B]/80"
          )}
        >
          {description}
        </span>
      </span>
    </li>
  );
}
