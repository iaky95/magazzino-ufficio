import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = (body?.username as string | undefined)?.trim() ?? "";
  const password = (body?.password as string | undefined) ?? "";

  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "Inserisci username e password" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("login_user", {
    p_username: username,
    p_password: password,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "Errore login" }, { status: 500 });
  }

  const row = (data ?? [])[0] as { role: "magazzino" | "ufficio"; display_name: string } | undefined;
  if (!row?.role) {
    return NextResponse.json({ ok: false, error: "Credenziali non valide" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, role: row.role });

  // cookie httpOnly
  res.cookies.set("role", row.role, { httpOnly: true, sameSite: "lax", path: "/" });
  // nome da mostrare/registrare sui prelievi
  res.cookies.set("name", row.display_name ?? username, { httpOnly: true, sameSite: "lax", path: "/" });

  return res;
}
