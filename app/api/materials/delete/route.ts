import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export async function POST(req: Request) {
  // 🔐 controllo ruolo (stesso schema di /api/me)
  const c = await cookies();
  const role = c.get("role")?.value ?? "";

  if (role !== "ufficio") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // body
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || "");

  if (!id) {
    return NextResponse.json({ error: "Missing material id" }, { status: 400 });
  }

  // 🔒 Supabase admin (service role)
  const supabaseAdmin = createClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { error } = await supabaseAdmin
    .from("materials")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
