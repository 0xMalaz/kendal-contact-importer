"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ellipsis, Loader2, PlusCircle } from "lucide-react";
import toast from "react-hot-toast";
import { AddAgentModal } from "@/components/add-agent-modal";

type AgentRecord = {
  id: string;
  name: string;
  email: string;
  uid: string;
  createdAt?: string;
};

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const COMPANY_ID = process.env.NEXT_PUBLIC_FIREBASE_COMPANY_ID;

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [openAgentActionsId, setOpenAgentActionsId] = useState<string | null>(
    null
  );
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (!openAgentActionsId) {
      return;
    }

    function handlePointer(event: MouseEvent | TouchEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-agent-actions-root='true']")) {
        return;
      }
      setOpenAgentActionsId(null);
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenAgentActionsId(null);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openAgentActionsId]);

  const hasAgents = useMemo(() => agents.length > 0, [agents.length]);

  const fetchAgents = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (options.silent) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      if (!COMPANY_ID) {
        setAgents([]);
        setError("Company configuration is missing.");
        if (options.silent) {
          setIsRefreshing(false);
        } else {
          setLoading(false);
        }
        return;
      }

      setError(null);

      try {
        const response = await fetch(
          `/api/agents?companyId=${encodeURIComponent(COMPANY_ID)}`
        );

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as {
          agents?: AgentRecord[];
        };

        setAgents(Array.isArray(payload.agents) ? payload.agents : []);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load agents.";
        console.error("Failed to load agents", err);
        setError(message);
      } finally {
        if (options.silent) {
          setIsRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const handleAgentCreated = useCallback(
    (agent: AgentRecord) => {
      setAgents((prev) => {
        const next = [agent, ...prev];
        return next.sort((a, b) => {
          const aMillis = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bMillis = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bMillis - aMillis;
        });
      });
    },
    []
  );

  const toggleAgentActions = useCallback((agentId: string) => {
    setOpenAgentActionsId((previous) =>
      previous === agentId ? null : agentId
    );
  }, []);

  const handleDeleteAgent = useCallback(
    async (agentId: string) => {
      if (!COMPANY_ID) {
        toast.error("Company configuration is missing.");
        setOpenAgentActionsId(null);
        return;
      }

      setDeletingAgentId(agentId);

      try {
        const response = await fetch(
          `/api/agents/${encodeURIComponent(
            agentId
          )}?companyId=${encodeURIComponent(COMPANY_ID)}`,
          { method: "DELETE" }
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          const message =
            payload?.error ?? `Request failed with status ${response.status}`;
          throw new Error(message);
        }

        setAgents((previous) =>
          previous.filter((agent) => agent.id !== agentId)
        );
        toast.success("Agent deleted.");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete agent.";
        console.error("Failed to delete agent", err);
        toast.error(message);
      } finally {
        setDeletingAgentId(null);
        setOpenAgentActionsId((previous) =>
          previous === agentId ? null : previous
        );
      }
    },
    [setAgents]
  );

  const handleRetry = useCallback(() => {
    void fetchAgents();
  }, [fetchAgents]);

  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Team
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Agents
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Review the agents connected to your workspace and invite new team
            members to assist contacts.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            disabled={!COMPANY_ID}
            title={
              COMPANY_ID ? undefined : "Company configuration is missing."
            }
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Add an Agent
          </button>
        </div>
      </section>

      <section className="mt-8 space-y-4">
        {error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-6 py-5 text-sm text-destructive">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center justify-center rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive transition hover:bg-destructive/10"
              >
                Try again
              </button>
            </div>
          </div>
        ) : null}

        <div className="relative rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Agent directory</span>
            {isRefreshing ? (
              <span className="text-[11px] text-muted-foreground">
                Refreshing...
              </span>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border/70">
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">UID</th>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70 text-sm">
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`agent-skeleton-${index}`} className="animate-pulse">
                      <td className="px-6 py-4">
                        <div className="h-4 w-40 rounded bg-muted/80" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-48 rounded bg-muted/80" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-32 rounded bg-muted/80" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-24 rounded bg-muted/80" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="ml-auto h-8 w-8 rounded-full bg-muted/80" />
                      </td>
                    </tr>
                  ))
                ) : !hasAgents ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-16 text-center text-sm text-muted-foreground"
                    >
                      No agents found. Use &ldquo;Add an Agent&rdquo; to invite
                      someone new.
                    </td>
                  </tr>
                ) : (
                  agents.map((agent) => (
                    <tr key={agent.id} className="transition hover:bg-muted/60">
                      <td className="px-6 py-4 font-medium text-foreground">
                        {agent.name || "-"}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {agent.email || "-"}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <span className="font-mono text-xs">{agent.uid}</span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {formatDate(agent.createdAt)}
                      </td>
                      <td
                        className="relative px-6 py-4 text-right"
                        data-agent-actions-root="true"
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleAgentActions(agent.id);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          aria-haspopup="menu"
                          aria-expanded={openAgentActionsId === agent.id}
                          aria-label={`Open actions for ${agent.name || "agent"}`}
                        >
                          <Ellipsis className="h-4 w-4" aria-hidden="true" />
                        </button>
                        {openAgentActionsId === agent.id ? (
                          <div
                            role="menu"
                            className="absolute right-6 top-2 z-10 min-w-[150px] -translate-y-full overflow-hidden rounded-lg border border-border/60 bg-card text-left shadow-xl"
                          >
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteAgent(agent.id);
                              }}
                              className="flex w-full items-center justify-between gap-3 px-4 py-2 text-sm text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={deletingAgentId === agent.id}
                              role="menuitem"
                            >
                              Delete
                              {deletingAgentId === agent.id ? (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : null}
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <AddAgentModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAgentCreated={handleAgentCreated}
        companyId={COMPANY_ID}
      />
    </>
  );
}
