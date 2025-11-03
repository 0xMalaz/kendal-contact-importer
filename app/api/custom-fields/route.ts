import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const fieldsRef = adminDb
      .collection("company")
      .doc(companyId)
      .collection("contactFields");

    const includeCore = searchParams.get("includeCore") === "true";

    const snapshot = await fieldsRef.get();

    const fields = snapshot.docs
      .map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      .filter((field) => includeCore || field.core === false)
      .sort((a, b) => {
        const labelA = typeof a.label === "string" ? a.label : "";
        const labelB = typeof b.label === "string" ? b.label : "";
        return labelA.localeCompare(labelB);
      });

    return NextResponse.json({ fields });
  } catch (error) {
    console.error("Failed to fetch custom fields", error);
    return NextResponse.json(
      { error: "Failed to fetch custom fields" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companyId, id, label, type, core, showAsColumn, previousId } =
      body ?? {};

    if (!companyId || !id || !label || !type) {
      return NextResponse.json(
        { error: "companyId, id, label, and type are required" },
        { status: 400 }
      );
    }

    const fieldsRef = adminDb
      .collection("company")
      .doc(companyId)
      .collection("contactFields");

    const payload = {
      label,
      type,
      core: Boolean(core),
      showAsColumn: Boolean(showAsColumn),
    };

    const targetRef = fieldsRef.doc(id);
    await targetRef.set(payload);

    if (previousId && previousId !== id) {
      await fieldsRef.doc(previousId).delete();
    }

    const savedSnapshot = await targetRef.get();

    return NextResponse.json(
      { field: { id: savedSnapshot.id, ...savedSnapshot.data() } },
      { status: previousId ? 200 : 201 }
    );
  } catch (error) {
    console.error("Failed to save custom field", error);
    return NextResponse.json(
      { error: "Failed to save custom field" },
      { status: 500 }
    );
  }
}
