import { PlusCircle } from "lucide-react";

const contacts = [
  {
    name: "Alicia Lane",
    email: "alicia.lane@example.com",
    company: "Lane & Co.",
    status: "Active",
    lastContacted: "Oct 28, 2025",
  },
  {
    name: "Marcus Reed",
    email: "marcus.reed@example.com",
    company: "Reed Logistics",
    status: "Active",
    lastContacted: "Oct 24, 2025",
  },
  {
    name: "Priya Patel",
    email: "priya.patel@example.com",
    company: "Northstar Labs",
    status: "Pending",
    lastContacted: "Oct 17, 2025",
  },
  {
    name: "Jonah Brooks",
    email: "jonah.brooks@example.com",
    company: "Signal Marketing",
    status: "Archived",
    lastContacted: "Sep 30, 2025",
  },
  {
    name: "Rosa Alvarez",
    email: "rosa.alvarez@example.com",
    company: "Alvarez Studio",
    status: "Active",
    lastContacted: "Sep 27, 2025",
  },
];

const badgeStyles: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-700",
  Pending: "bg-amber-100 text-amber-700",
  Archived: "bg-slate-200 text-slate-700",
};

export default function ContactsPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Contacts
          </h1>
          <p className="text-sm text-muted-foreground">
            Review and manage the people you collaborate with.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90">
          <PlusCircle className="h-4 w-4" aria-hidden="true" />
          Import Contacts
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <table className="min-w-full divide-y divide-border/70">
          <thead className="bg-muted/60">
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Email</th>
              <th className="px-6 py-3">Company</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Last contacted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70 text-sm">
            {contacts.map((contact) => (
              <tr key={contact.email} className="transition hover:bg-muted/60">
                <td className="px-6 py-4 font-medium text-foreground">
                  {contact.name}
                </td>
                <td className="px-6 py-4 text-muted-foreground">
                  {contact.email}
                </td>
                <td className="px-6 py-4 text-muted-foreground">
                  {contact.company}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                      badgeStyles[contact.status] ?? "bg-muted text-foreground"
                    }`}
                  >
                    {contact.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-muted-foreground">
                  {contact.lastContacted}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
