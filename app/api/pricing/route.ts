import { NextResponse } from "next/server";
import { getLivePrice } from "@/lib/pricing";

/**
 * Returns current live price and scarcity info for the checkout modal.
 * No auth required (public pricing).
 */
export async function GET() {
  const result = await getLivePrice();
  return NextResponse.json(result);
}
