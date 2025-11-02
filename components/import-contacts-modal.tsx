"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Minus, Paperclip, Sparkles, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

type ImportContactsModalProps = {
  open: boolean;
  onClose: () => void;
};

export function ImportContactsModal({ open, onClose }: ImportContactsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setFile(null);
    setIsDragging(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    const nextFile = files[0];
    const allowedTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    if (
      allowedTypes.includes(nextFile.type) ||
      nextFile.name.endsWith(".csv") ||
      nextFile.name.endsWith(".xlsx")
    ) {
      setFile(nextFile);
    }
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
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
            <StepBadge label="Detect Fields" index={1} active />
            <StepBadge label="Map Fields" index={2} />
            <StepBadge label="Final Checks" index={3} />
          </ol>
        </div>

        <div className="flex flex-1 flex-col justify-between gap-8 overflow-y-auto bg-gradient-to-b from-background via-background to-muted/40 px-6 py-8">
          {!file ? (
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
                  onChange={(event) => handleFiles(event.target.files)}
                />
              </div>
            </section>
          ) : (
            <section className="space-y-8">
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">
                  AI Column Detection…
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
                    Auto Detecting Field Mapping…
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Matching spreadsheet columns to CRM fields using intelligent
                    pattern recognition.
                  </p>
                </div>
                <div className="flex min-w-[240px] items-center gap-3 rounded-full border bg-muted/60 px-4 py-2 text-left text-xs text-muted-foreground">
                  <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate font-medium text-foreground">
                    {file.name}
                  </span>
                </div>
                <div className="flex w-full max-w-sm items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    45%
                  </span>
                  <div className="relative h-2 flex-1 rounded-full bg-muted">
                    <span className="absolute inset-y-0 left-0 w-2/4 rounded-full bg-primary transition-[width]" />
                  </div>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                </div>
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
              className="rounded-lg border px-4 py-2 font-medium transition hover:bg-muted"
            >
              Previous
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Next
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function StepBadge({
  label,
  index,
  active = false,
}: {
  label: string;
  index: number;
  active?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex min-w-[120px] flex-1 items-center gap-3 rounded-full px-3 py-2",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold",
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30 bg-background"
        )}
      >
        {index}
      </span>
      <span className="text-left text-[11px] font-semibold uppercase tracking-wide">
        {label}
      </span>
    </li>
  );
}
