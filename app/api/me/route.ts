import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const c = await cookies();
  const role = c.get("role")?.value ?? "";
  const name = c.get("name")?.value ?? "";
  return NextResponse.json({ role, name });
}
