import { NextRequest, NextResponse } from "next/server";
import { getPaymentStatus, getPendingUserId } from "@/lib/payment-store";
import { getUserIdFromRequest } from "@/lib/credits";
import { getUserIdByCheckoutId } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference");
  if (!reference?.trim()) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  const authUserId = await getUserIdFromRequest(request);
  if (!authUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ref = reference.trim();
  const pendingUserId = getPendingUserId(ref);
  const refUserId = pendingUserId ?? (await getUserIdByCheckoutId(ref));
  if (refUserId !== authUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = getPaymentStatus(ref);
  return NextResponse.json(status);
}
