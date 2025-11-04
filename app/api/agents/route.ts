import { NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FirestoreAgent = {
  name?: unknown;
  email?: unknown;
  uid?: unknown;
  createdAt?: unknown;
};

type AgentPayload = {
  id: string;
  name: string;
  email: string;
  uid: string;
  createdAt?: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeTimestamp(value: unknown) {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return undefined;
  }

  const maybeTimestamp = value as {
    toDate?: () => Date;
    toMillis?: () => number;
    seconds?: number;
    nanoseconds?: number;
  };

  if (typeof maybeTimestamp.toDate === "function") {
    try {
      return maybeTimestamp.toDate()?.toISOString();
    } catch {
      return undefined;
    }
  }

  if (typeof maybeTimestamp.toMillis === "function") {
    try {
      const millis = maybeTimestamp.toMillis();
      if (Number.isFinite(millis)) {
        return new Date(millis).toISOString();
      }
    } catch {
      return undefined;
    }
  }

  if (
    typeof maybeTimestamp.seconds === "number" &&
    typeof maybeTimestamp.nanoseconds === "number"
  ) {
    const millis =
      maybeTimestamp.seconds * 1000 + maybeTimestamp.nanoseconds / 1_000_000;
    if (Number.isFinite(millis)) {
      return new Date(millis).toISOString();
    }
  }

  return undefined;
}

function mapAgentDoc(doc: QueryDocumentSnapshot): AgentPayload {
  const data = doc.data() as FirestoreAgent;

  const name = normalizeString(data.name).trim();
  const email = normalizeString(data.email).trim();
  const uid = normalizeString(data.uid).trim() || doc.id;
  const createdAt = normalizeTimestamp(data.createdAt);

  return {
    id: doc.id,
    name,
    email,
    uid,
    ...(createdAt ? { createdAt } : {}),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }

    const snapshot = await adminDb
      .collection("company")
      .doc(companyId)
      .collection("users")
      .get();

    const agents = snapshot.docs.map(mapAgentDoc);

    agents.sort((a, b) => {
      const aMillis = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bMillis = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bMillis - aMillis;
    });

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Failed to fetch agents", error);
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {
          name?: unknown;
          email?: unknown;
        }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400 }
      );
    }

    const rawName = normalizeString(body.name).trim();
    const rawEmail = normalizeString(body.email).trim().toLowerCase();

    if (!rawName) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (!rawEmail) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const docRef = adminDb
      .collection("company")
      .doc(companyId)
      .collection("users")
      .doc();

    const now = new Date().toISOString();

    await docRef.set({
      name: rawName,
      email: rawEmail,
      uid: docRef.id,
      createdAt: now,
    });

    return NextResponse.json(
      {
        agent: {
          id: docRef.id,
          name: rawName,
          email: rawEmail,
          uid: docRef.id,
          createdAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create agent", error);
    return NextResponse.json(
      { error: "Failed to create agent" },
      { status: 500 }
    );
  }
}
