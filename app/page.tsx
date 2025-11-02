import Link from "next/link";
import { ArrowRight, UsersRound } from "lucide-react";
import { Suspense } from "react";
import { ContactsStat } from "@/components/contacts-stat";

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-3">
        <span className="text-sm font-medium text-muted-foreground">
          Dashboard
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Welcome back to Kendal
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Keep your contacts organized and synced across all of your tools.
        </p>
      </section>

      <Link
        href="/contacts"
        className="group block overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-background p-8 shadow-sm transition hover:border-primary/30 hover:shadow-lg"
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-4">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              Feature highlight
            </span>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Manage your contacts
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Quickly review your address book, import new records, or update
                existing contacts with a few clicks.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:translate-x-1">
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
        </div>
      </Link>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            Total contacts
            <UsersRound className="h-4 w-4 opacity-60" aria-hidden="true" />
          </div>
          <Suspense
            fallback={
              <div className="mt-6 h-9 w-20 animate-pulse rounded bg-muted/80" />
            }
          >
            <ContactsStat />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
