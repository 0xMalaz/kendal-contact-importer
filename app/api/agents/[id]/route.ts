import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const params = await context.params;
  const agentId = params?.id;

  if (!agentId) {
    return NextResponse.json(
      { error: "Agent id is required." },
      { status: 400 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }

    await adminDb
      .collection("company")
      .doc(companyId)
      .collection("users")
      .doc(agentId)
      .delete();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete agent", error);
    return NextResponse.json(
      { error: "Failed to delete agent" },
      { status: 500 }
    );
  }
}
