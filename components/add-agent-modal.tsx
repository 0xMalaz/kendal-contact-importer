"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import toast from "react-hot-toast";

type AgentRecord = {
  id: string;
  name: string;
  email: string;
  uid: string;
  createdAt?: string;
};

type AddAgentModalProps = {
  open: boolean;
  onClose: () => void;
  onAgentCreated?: (agent: AgentRecord) => void;
  companyId?: string | null;
};

type FormState = {
  name: string;
  email: string;
  validationError: string | null;
};

const DEFAULT_FORM_STATE: FormState = {
  name: "",
  email: "",
  validationError: null,
};

function normalizeInput(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function AddAgentModal({
  open,
  onClose,
  onAgentCreated,
  companyId,
}: AddAgentModalProps) {
  const [formState, setFormState] = useState<FormState>(DEFAULT_FORM_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReadyToSubmit = useMemo(() => {
    return (
      normalizeInput(formState.name).length > 0 &&
      normalizeInput(formState.email).length > 0 &&
      !submitting &&
      Boolean(companyId)
    );
  }, [companyId, formState.email, formState.name, submitting]);

  useEffect(() => {
    if (open) {
      setFormState(DEFAULT_FORM_STATE);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const closeModal = useCallback(() => {
    setFormState(DEFAULT_FORM_STATE);
    setError(null);
    onClose();
  }, [onClose]);

  const handleClose = useCallback(() => {
    if (submitting) {
      return;
    }
    closeModal();
  }, [closeModal, submitting]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (submitting) {
        return;
      }

      const normalizedName = normalizeInput(formState.name);
      const normalizedEmail = normalizeInput(formState.email).toLowerCase();

      if (!normalizedName) {
        setFormState((prev) => ({
          ...prev,
          validationError: "Please enter the agent's name.",
        }));
        return;
      }

      if (!normalizedEmail) {
        setFormState((prev) => ({
          ...prev,
          validationError: "Please enter a valid email address.",
        }));
        return;
      }

      setSubmitting(true);
      setError(null);
      setFormState((prev) => ({ ...prev, validationError: null }));

      try {
        if (!companyId) {
          throw new Error("Company configuration is missing.");
        }

        const endpoint = `/api/agents?companyId=${encodeURIComponent(
          companyId
        )}`;

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: normalizedName,
            email: normalizedEmail,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          const message =
            payload?.error ?? `Request failed with status ${response.status}`;
          throw new Error(message);
        }

        const payload = (await response.json()) as {
          agent?: AgentRecord;
        };

        if (!payload.agent) {
          throw new Error("The server returned an unexpected response.");
        }

        toast.success("Agent added successfully.");

        onAgentCreated?.(payload.agent);
        closeModal();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to add agent.";

        console.error("Failed to add agent", err);
        setError(message);
        toast.error(message);
      } finally {
        setSubmitting(false);
      }
    },
    [
      companyId,
      formState.email,
      formState.name,
      closeModal,
      onAgentCreated,
      submitting,
    ]
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 sm:px-6">
      <div className="absolute inset-0 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-muted-foreground/20 bg-card shadow-2xl">
        <header className="flex items-start justify-between border-b border-border/60 bg-muted/50 px-6 py-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Add Agent
            </h2>
            <p className="text-sm text-muted-foreground">
              Create a new agent by providing their name and email address.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-muted-foreground/30 p-1.5 text-muted-foreground transition hover:bg-muted disabled:opacity-50"
            disabled={submitting}
            aria-label="Close modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
          <div className="space-y-2">
            <label
              htmlFor="agent-name"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Name
            </label>
            <input
              id="agent-name"
              type="text"
              value={formState.name}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  name: event.target.value,
                  validationError: null,
                }))
              }
              placeholder="Alex Johnson"
              className="w-full rounded-lg border border-muted-foreground/30 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoComplete="name"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="agent-email"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Email
            </label>
            <input
              id="agent-email"
              type="email"
              value={formState.email}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  email: event.target.value,
                  validationError: null,
                }))
              }
              placeholder="alex@company.com"
              className="w-full rounded-lg border border-muted-foreground/30 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoComplete="email"
            />
          </div>

          {formState.validationError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {formState.validationError}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          {!companyId ? (
            <div className="rounded-lg border border-muted-foreground/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Company configuration is missing. Please set{" "}
              <span className="px-1 font-mono">
                NEXT_PUBLIC_FIREBASE_COMPANY_ID
              </span>{" "}
              and reload the page.
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-muted-foreground/30 px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted disabled:opacity-50"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isReadyToSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving...
                </>
              ) : (
                "Add Agent"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
