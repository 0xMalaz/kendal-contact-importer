import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContactRecord = {
  id: string;
  createdOn?: unknown;
  [key: string]: unknown;
};

function getTimestampMillis(value: unknown) {
  if (!value || typeof value !== "object") {
    return 0;
  }

  const maybeTimestamp = value as {
    toMillis?: () => number;
    seconds?: number;
    nanoseconds?: number;
  };

  if (typeof maybeTimestamp.toMillis === "function") {
    return maybeTimestamp.toMillis();
  }

  if (
    typeof maybeTimestamp.seconds === "number" &&
    typeof maybeTimestamp.nanoseconds === "number"
  ) {
    return (
      maybeTimestamp.seconds * 1000 + maybeTimestamp.nanoseconds / 1_000_000
    );
  }

  return 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  try {
    const contactsRef = adminDb
      .collection("company")
      .doc(companyId)
      .collection("contacts");

    const snapshot = await contactsRef.get();

    const contacts: ContactRecord[] = snapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data() as Record<string, unknown>;
      return {
        id: docSnapshot.id,
        ...data,
      };
    });

    contacts.sort(
      (a, b) =>
        getTimestampMillis(b.createdOn) - getTimestampMillis(a.createdOn)
    );

    return NextResponse.json({ contacts });
  } catch (error) {
    console.error("Failed to fetch contacts", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}
