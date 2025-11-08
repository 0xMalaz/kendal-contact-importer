import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  // Derive field id reliably, even if params isn't populated by the runtime
  const url = new URL(request.url);
  const fallbackId = decodeURIComponent(
    (url.pathname.split("/").pop() ?? "").trim()
  );
  const resolvedParams = await params;
  const fieldId = (resolvedParams?.id ?? fallbackId) as string;

  try {
    const body = await request.json().catch(() => ({}));
    const { companyId: bodyCompanyId, ...updates } = (body as any) ?? {};
    const companyId = bodyCompanyId || url.searchParams.get("companyId");

    if (!companyId || typeof companyId !== "string" || !companyId.trim()) {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }

    if (typeof fieldId !== "string" || fieldId.trim().length === 0) {
      return NextResponse.json(
        { error: "id is required in path" },
        { status: 400 }
      );
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "At least one field to update is required" },
        { status: 400 }
      );
    }

    const fieldRef = adminDb
      .collection("company")
      .doc(companyId)
      .collection("contactFields")
      .doc(fieldId);

    // Use merge to avoid failures when the document doesn't exist yet
    // and to update only the provided fields.
    await fieldRef.set(updates, { merge: true });

    const snapshot = await fieldRef.get();

    return NextResponse.json({
      field: { id: snapshot.id, ...snapshot.data() },
    });
  } catch (error) {
    console.error("Failed to update custom field", error);
    return NextResponse.json(
      { error: "Failed to update custom field" },
      { status: 500 }
    );
  }
}

// POST behaves like PATCH here: upsert partial updates for a field by id.
export async function POST(request: Request, { params }: RouteParams) {
  const url = new URL(request.url);
  const fallbackId = decodeURIComponent(
    (url.pathname.split("/").pop() ?? "").trim()
  );
  const resolvedParams = await params;
  const fieldId = (resolvedParams?.id ?? fallbackId) as string;

  try {
    const body = await request.json().catch(() => ({}));
    const { companyId: bodyCompanyId, ...updates } = (body as any) ?? {};
    const companyId = bodyCompanyId || url.searchParams.get("companyId");

    if (!companyId || typeof companyId !== "string" || !companyId.trim()) {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }

    if (typeof fieldId !== "string" || fieldId.trim().length === 0) {
      return NextResponse.json(
        { error: "id is required in path" },
        { status: 400 }
      );
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "At least one field to update is required" },
        { status: 400 }
      );
    }

    const fieldRef = adminDb
      .collection("company")
      .doc(companyId)
      .collection("contactFields")
      .doc(fieldId);

    await fieldRef.set(updates, { merge: true });

    const snapshot = await fieldRef.get();

    return NextResponse.json({
      field: { id: snapshot.id, ...snapshot.data() },
    });
  } catch (error) {
    console.error("Failed to update custom field (POST)", error);
    return NextResponse.json(
      { error: "Failed to update custom field" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const url = new URL(request.url);
  const fallbackId = decodeURIComponent(
    (url.pathname.split("/").pop() ?? "").trim()
  );
  const resolvedParams = await params;
  const fieldId = (resolvedParams?.id ?? fallbackId) as string;
  const companyId = url.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  try {
    await adminDb
      .collection("company")
      .doc(companyId)
      .collection("contactFields")
      .doc(fieldId)
      .delete();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete custom field", error);
    return NextResponse.json(
      { error: "Failed to delete custom field" },
      { status: 500 }
    );
  }
}
