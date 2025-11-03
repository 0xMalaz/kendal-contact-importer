import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function PATCH(request: Request, { params }: RouteParams) {
  const fieldId = params.id;

  try {
    const body = await request.json();
    const { companyId, ...updates } = body ?? {};

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required" },
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

    await fieldRef.update(updates);

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

export async function DELETE(request: Request, { params }: RouteParams) {
  const fieldId = params.id;
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

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
