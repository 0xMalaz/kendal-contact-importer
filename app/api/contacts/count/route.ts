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
    const contactsRef = adminDb
      .collection("company")
      .doc(companyId)
      .collection("contacts");

    const countSnapshot = await contactsRef.count().get();
    const data = countSnapshot.data();

    return NextResponse.json({ count: data.count ?? 0 });
  } catch (error) {
    console.error("Failed to fetch contact count", error);
    return NextResponse.json(
      { error: "Failed to fetch contact count" },
      { status: 500 }
    );
  }
}
