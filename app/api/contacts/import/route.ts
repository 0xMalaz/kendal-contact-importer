import { NextResponse } from "next/server";
import type {
  CollectionReference,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import {
  detectAgentEmailColumn,
  objectRowsToMatrix,
} from "@/lib/mapping/agentEmailDetector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportRequestPayload = {
  headers?: unknown;
  mappings?: unknown;
  rows?: unknown;
  agentColumn?: unknown;
  commit?: unknown;
};

type NormalizedMapping = {
  csvColumn: string;
  fieldId: string;
};

const BATCH_LIMIT = 400;
const PHONE_SANITIZE_REGEX = /[^\d]/g;

function normalizeHeaders(headers: unknown): string[] {
  if (!Array.isArray(headers)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const header of headers) {
    if (typeof header !== "string") {
      continue;
    }
    const trimmed = header.trim();
    if (!trimmed.length || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function normalizeMappings(mappings: unknown): NormalizedMapping[] {
  if (!Array.isArray(mappings)) {
    return [];
  }

  const normalized: NormalizedMapping[] = [];

  for (const mapping of mappings) {
    if (!mapping || typeof mapping !== "object") {
      continue;
    }

    const record = mapping as Record<string, unknown>;
    const csvColumn =
      typeof record.csvColumn === "string" ? record.csvColumn.trim() : "";
    const fieldId =
      typeof record.fieldId === "string" ? record.fieldId.trim() : "";

    if (!csvColumn.length || !fieldId.length || fieldId === "agentUid") {
      continue;
    }

    normalized.push({ csvColumn, fieldId });
  }

  return normalized;
}

function normalizeRows(
  rows: unknown,
  columns: string[]
): Record<string, string>[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const normalized: Record<string, string>[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const source = row as Record<string, unknown>;
    const normalizedRow: Record<string, string> = {};

    for (const column of columns) {
      const rawValue = source[column];
      const value =
        typeof rawValue === "string"
          ? rawValue.trim()
          : rawValue === null || rawValue === undefined
          ? ""
          : String(rawValue).trim();
      normalizedRow[column] = value;
    }

    // Skip rows that are entirely empty to reduce noise
    if (Object.values(normalizedRow).every((value) => !value.length)) {
      continue;
    }

    normalized.push(normalizedRow);
  }

  return normalized;
}

async function runLookup(
  collection: CollectionReference,
  field: string,
  value: string
): Promise<QueryDocumentSnapshot | null> {
  if (!value) {
    return null;
  }
  const snapshot = await collection.where(field, "==", value).limit(1).get();
  return snapshot.empty ? null : snapshot.docs[0];
}

async function findExistingContact(
  collection: CollectionReference,
  emailValue: string,
  normalizedEmail: string,
  phoneValue: string,
  normalizedPhone: string
): Promise<QueryDocumentSnapshot | null> {
  return (
    (await runLookup(collection, "email", emailValue)) ??
    (await runLookup(collection, "emailSearch", normalizedEmail)) ??
    (await runLookup(collection, "phone", phoneValue)) ??
    (await runLookup(collection, "phoneSearch", normalizedPhone))
  );
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  let payload: ImportRequestPayload | null = null;

  try {
    payload = (await request.json()) as ImportRequestPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const commit = Boolean(payload?.commit);
  const headers = normalizeHeaders(payload?.headers);
  const mappings = normalizeMappings(payload?.mappings);

  if (!headers.length) {
    return NextResponse.json(
      { error: "No headers were provided for this import." },
      { status: 400 }
    );
  }

  if (!mappings.length) {
    return NextResponse.json(
      { error: "No CRM field mappings were supplied." },
      { status: 400 }
    );
  }

  const columnSet = Array.from(
    new Set([...headers, ...mappings.map((mapping) => mapping.csvColumn)])
  );
  const rows = normalizeRows(payload?.rows, columnSet);

  if (!rows.length) {
    return NextResponse.json(
      { error: "No data rows to import." },
      { status: 400 }
    );
  }

  let detectedAgentColumn =
    typeof payload?.agentColumn === "string"
      ? payload.agentColumn.trim()
      : "";

  if (detectedAgentColumn.length) {
    const matchedHeader =
      headers.find(
        (header) => header.toLowerCase() === detectedAgentColumn.toLowerCase()
      ) ?? "";
    detectedAgentColumn = matchedHeader;
  }

  if (!detectedAgentColumn) {
    const matrix = objectRowsToMatrix(headers, rows.slice(0, 200));
    const detection = detectAgentEmailColumn(headers, matrix);
    if (!detection) {
      return NextResponse.json(
        { error: "Could not detect an agent email column." },
        { status: 422 }
      );
    }
    detectedAgentColumn = detection.header;
  }

  try {
    const agentsSnapshot = await adminDb
      .collection("company")
      .doc(companyId)
      .collection("users")
      .get();

    const agentByEmail = new Map<string, { uid: string }>();

    agentsSnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data() ?? {};
      const email =
        typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
      const uid =
        typeof data.uid === "string" && data.uid.trim().length
          ? data.uid.trim()
          : docSnapshot.id;

      if (email) {
        agentByEmail.set(email, { uid });
      }
    });

    if (!agentByEmail.size) {
      return NextResponse.json(
        { error: "No agents available to assign contacts." },
        { status: 409 }
      );
    }

    const mappingByColumn = new Map<string, string>();
    for (const mapping of mappings) {
      mappingByColumn.set(mapping.csvColumn, mapping.fieldId);
    }

    const contactsCollection = adminDb
      .collection("company")
      .doc(companyId)
      .collection("contacts");

    let imported = 0;
    let merged = 0;
    let skipped = 0;
    const errorReasons = new Set<string>();
    let batch = commit ? adminDb.batch() : null;
    let operationsInBatch = 0;
    const batches: Promise<unknown>[] = [];

    for (const row of rows) {
      const agentEmail =
        (row[detectedAgentColumn] ?? "").toLowerCase().trim();

      if (!agentEmail || !agentByEmail.has(agentEmail)) {
        skipped += 1;
        errorReasons.add("Agent email missing or does not match any active agent");
        continue;
      }

      const nowIso = new Date().toISOString();
      const baseContact: Record<string, unknown> = {
        agentUid: agentByEmail.get(agentEmail)?.uid,
      };

      for (const [column, fieldId] of mappingByColumn.entries()) {
        const rawValue = row[column] ?? "";
        if (!rawValue || !rawValue.length) {
          continue;
        }
        baseContact[fieldId] = rawValue;
      }

      const emailValue =
        typeof baseContact.email === "string"
          ? baseContact.email.trim()
          : "";
      if (emailValue) {
        baseContact.email = emailValue;
      }
      const normalizedEmail = emailValue.toLowerCase();

      const phoneValue =
        typeof baseContact.phone === "string"
          ? baseContact.phone.trim()
          : "";
      if (phoneValue) {
        baseContact.phone = phoneValue;
      }
      const normalizedPhone = phoneValue.replace(PHONE_SANITIZE_REGEX, "");

      const existingContact = await findExistingContact(
        contactsCollection,
        emailValue,
        normalizedEmail,
        phoneValue,
        normalizedPhone
      );

      if (existingContact) {
        const updateDoc: Record<string, unknown> = {
          ...baseContact,
          updatedOn: nowIso,
        };
        if (normalizedEmail) {
          updateDoc.emailSearch = normalizedEmail;
        }
        if (normalizedPhone) {
          updateDoc.phoneSearch = normalizedPhone;
        }
        if (commit && batch) {
          batch.update(existingContact.ref, updateDoc);
        }
        merged += 1;
      } else {
        const contactDoc: Record<string, unknown> = {
          ...baseContact,
          createdOn: nowIso,
          updatedOn: nowIso,
        };
        if (normalizedEmail) {
          contactDoc.emailSearch = normalizedEmail;
        }
        if (normalizedPhone) {
          contactDoc.phoneSearch = normalizedPhone;
        }
        if (commit && batch) {
          const docRef = contactsCollection.doc();
          batch.set(docRef, contactDoc);
        }
        imported += 1;
      }

      if (commit && batch) {
        operationsInBatch += 1;

        if (operationsInBatch >= BATCH_LIMIT) {
          batches.push(batch.commit());
          batch = adminDb.batch();
          operationsInBatch = 0;
        }
      }
    }

    if (commit && batch && operationsInBatch > 0) {
      batches.push(batch.commit());
    }

    if (commit && batches.length) {
      await Promise.all(batches);
    }

    return NextResponse.json({
      imported,
      merged,
      errors: skipped,
      agentColumn: detectedAgentColumn,
      errorReasons: Array.from(errorReasons),
      committed: commit,
    });
  } catch (error) {
    console.error("Failed to import contacts", error);
    return NextResponse.json(
      { error: "Failed to import contacts" },
      { status: 500 }
    );
  }
}
