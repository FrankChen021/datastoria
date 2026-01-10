import { handlers, isAuthEnabled } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  if (isAuthEnabled()) {
    return await handlers.GET(request);
  }
  return NextResponse.json({ message: "Authentication is not enabled" });
}

export async function POST(request: NextRequest) {
  if (isAuthEnabled()) {
    return await handlers.POST(request);
  }
  return NextResponse.next();
}
