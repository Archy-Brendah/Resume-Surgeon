import { NextRequest, NextResponse } from "next/server";
import { getPaymentStatus } from "@/lib/payment-store";

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference");
  if (!reference?.trim()) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  const status = getPaymentStatus(reference.trim());
  return NextResponse.json(status);
}
