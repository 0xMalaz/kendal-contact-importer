import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
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
    if (snapshot.empty) {
      return NextResponse.json({ deletedCount: 0 });
    }

    let batch = adminDb.batch();
    let operationsInBatch = 0;
    let deletedCount = 0;

    for (const docSnapshot of snapshot.docs) {
      batch.delete(docSnapshot.ref);
      operationsInBatch += 1;
      deletedCount += 1;

      if (operationsInBatch === 500) {
        await batch.commit();
        batch = adminDb.batch();
        operationsInBatch = 0;
      }
    }

    if (operationsInBatch > 0) {
      await batch.commit();
    }

    return NextResponse.json({ deletedCount });
  } catch (error) {
    console.error("Failed to delete all contacts", error);
    return NextResponse.json(
      { error: "Failed to delete contacts" },
      { status: 500 }
    );
  }
}

