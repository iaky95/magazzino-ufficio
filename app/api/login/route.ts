import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const role = body?.role as "magazzino" | "ufficio" | undefined;
  const pin = (body?.pin as string | undefined) ?? "";
  const name = (body?.name as string | undefined) ?? "";

  const pinMag = process.env.PIN_MAGAZZINO ?? "";
  const pinUff = process.env.PIN_UFFICIO ?? "";

  const ok =
    (role === "magazzino" && pin === pinMag) ||
    (role === "ufficio" && pin === pinUff);

  if (!ok) {
    return NextResponse.json({ ok: false, error: "PIN non valido" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });

  // cookie httpOnly (non leggibile da JS)
  res.cookies.set("role", role!, { httpOnly: true, sameSite: "lax", path: "/" });

  // nome magazziniere: ha senso solo per magazzino, ma lo salvo comunque
  res.cookies.set("name", role === "magazzino" ? name.trim() : "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return res;
}
