"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Pickup = {
  id: string;
  customer: string;
  notes: string;
  status: "NUOVO" | "IN_LAVORAZIONE" | "PRONTO" | "CHIUSO";
  created_by: string | null;
  created_at: string;
};

type Item = {
  id: string;
  pickup_id: string;
  name: string;
  qty: number;
  notes: string;
  created_at: string;
};

export default function MagazzinoPage() {
  const [me, setMe] = useState<{ role: string; name: string }>({ role: "", name: "" });
  const [authLoading, setAuthLoading] = useState(true);

  const [customer, setCustomer] = useState("");
  const [pickupNotes, setPickupNotes] = useState("");
  const [items, setItems] = useState<{ name: string; qty: number; notes: string }[]>([
    { name: "", qty: 1, notes: "" },
  ]);

  const [materials, setMaterials] = useState<string[]>([]);
  const [pickups, setPickups] = useState<(Pickup & { items: Item[] })[]>([]);
  const [sending, setSending] = useState(false);

  const canSend = useMemo(() => {
    const hasCustomer = customer.trim().length > 0;
    const hasItems = items.some((i) => i.name.trim().length > 0);
    const hasName = (me.name ?? "").trim().length > 0;
    return hasCustomer && hasItems && hasName && !sending;
  }, [customer, items, me.name, sending]);

  async function fetchMeOrRedirect() {
    const r = await fetch("/api/me", { cache: "no-store" });
    const j = await r.json().catch(() => ({ role: "", name: "" }));

    if (j.role !== "magazzino") {
      window.location.href = "/login";
      return null;
    }
    setMe({ role: j.role, name: j.name || "" });
    return j as { role: string; name: string };
  }

  async function loadMaterials() {
    const { data, error } = await supabase
      .from("materials")
      .select("name")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }
    setMaterials((data ?? []).map((x: any) => x.name));
  }

  async function loadPickups() {
    const { data: p, error: ep } = await supabase
      .from("pickups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (ep) {
      console.error(ep);
      return;
    }

    const ids = (p ?? []).map((x: any) => x.id);
    if (ids.length === 0) {
      setPickups([]);
      return;
    }

    const { data: it, error: ei } = await supabase
      .from("pickup_items")
      .select("*")
      .in("pickup_id", ids);

    if (ei) {
      console.error(ei);
      return;
    }

    const byPickup = new Map<string, Item[]>();
    (it ?? []).forEach((x: any) => {
      byPickup.set(x.pickup_id, [...(byPickup.get(x.pickup_id) ?? []), x as Item]);
    });

    setPickups(
      (p ?? []).map((x: any) => ({
        ...(x as Pickup),
        items: byPickup.get(x.id) ?? [],
      }))
    );
  }

  useEffect(() => {
    (async () => {
      setAuthLoading(true);
      const ok = await fetchMeOrRedirect();
      if (!ok) return;

      await Promise.all([loadMaterials(), loadPickups()]);
      setAuthLoading(false);

      const ch = supabase
        .channel("realtime-pickups-magazzino")
        .on("postgres_changes", { event: "*", schema: "public", table: "pickups" }, () => loadPickups())
        .on("postgres_changes", { event: "*", schema: "public", table: "pickup_items" }, () => loadPickups())
        .on("postgres_changes", { event: "*", schema: "public", table: "materials" }, () => loadMaterials())
        .subscribe();

      return () => {
        supabase.removeChannel(ch);
      };
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addRow() {
    setItems((prev) => [...prev, { name: "", qty: 1, notes: "" }]);
  }

  async function sendPickup() {
    if (!canSend) return;
    setSending(true);

    const who = (me.name ?? "").trim();

    const { data: pickup, error: e1 } = await supabase
      .from("pickups")
      .insert([
        {
          customer: customer.trim(),
          notes: pickupNotes.trim(),
          status: "NUOVO",
          created_by: who,
        },
      ])
      .select("*")
      .single();

    if (e1) {
      console.error(e1);
      setSending(false);
      return;
    }

    const cleanItems = items
      .filter((i) => i.name.trim().length > 0)
      .map((i) => ({
        pickup_id: pickup.id,
        name: i.name.trim(),
        qty: Number(i.qty) > 0 ? Number(i.qty) : 1,
        notes: i.notes.trim(),
      }));

    const { error: e2 } = await supabase.from("pickup_items").insert(cleanItems);
    if (e2) console.error(e2);

    setCustomer("");
    setPickupNotes("");
    setItems([{ name: "", qty: 1, notes: "" }]);

    await loadPickups();
    setSending(false);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (authLoading) {
    return (
      <main style={wrap}>
        <h1 style={{ margin: 0 }}>Magazzino</h1>
        <p style={{ color: "#666" }}>Caricamento…</p>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0 }}>Magazzino</h1>
          <p style={{ marginTop: 6, color: "#555" }}>
            Inserisci cosa ha preso il cliente e invia all’ufficio.
          </p>
          <div style={{ marginTop: 6, fontSize: 13, color: "#444" }}>
            Loggato come: <b>{me.name}</b>
          </div>
        </div>

        <button style={btn} onClick={logout}>
          Esci
        </button>
      </header>

      <section style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
          <label style={lab}>
            Cliente
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} style={inp} placeholder="es. Rossi SRL" />
          </label>

          <label style={lab}>
            Note prelievo (opz.)
            <input value={pickupNotes} onChange={(e) => setPickupNotes(e.target.value)} style={inp} placeholder="es. urgente" />
          </label>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Materiali</div>

          <datalist id="materials-list">
            {materials.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          <div style={{ display: "grid", gap: 10 }}>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 90px 1fr 44px", gap: 10 }}>
                <input
                  style={inp}
                  list="materials-list"
                  placeholder="Materiale (scegli o scrivi)"
                  value={it.name}
                  onChange={(e) =>
                    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                  }
                />
                <input
                  style={inp}
                  type="number"
                  min={1}
                  value={it.qty}
                  onChange={(e) =>
                    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) } : x)))
                  }
                />
                <input
                  style={inp}
                  placeholder="Note materiale (opz.)"
                  value={it.notes}
                  onChange={(e) =>
                    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, notes: e.target.value } : x)))
                  }
                />
                <button
                  style={miniBtn}
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  title="Rimuovi"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button style={btn} onClick={addRow}>
              + Aggiungi materiale
            </button>
            <button style={{ ...btn, opacity: canSend ? 1 : 0.5 }} disabled={!canSend} onClick={sendPickup}>
              {sending ? "Invio…" : "Invia all’ufficio"}
            </button>
          </div>
        </div>
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Ultimi prelievi</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {pickups.map((p) => (
            <div key={p.id} style={box}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>{p.customer}</div>
                <div style={badge}>{p.status}</div>
              </div>

              <div style={{ marginTop: 6, fontSize: 13, color: "#444" }}>
                Inserito da: <b>{p.created_by || "—"}</b>
              </div>

              {p.notes && <div style={{ color: "#555", marginTop: 6 }}>Note: {p.notes}</div>}

              <ul style={{ margin: "10px 0 0 18px" }}>
                {p.items.map((i) => (
                  <li key={i.id}>
                    {i.qty}× {i.name}
                    {i.notes ? ` — (${i.notes})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

const wrap: React.CSSProperties = { padding: 24, fontFamily: "system-ui", maxWidth: 1150, margin: "0 auto" };
const card: React.CSSProperties = { border: "1px solid #e6e6e6", borderRadius: 14, padding: 16, marginTop: 16 };
const lab: React.CSSProperties = { display: "grid", gap: 6, fontSize: 14 };
const inp: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 };
const btn: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer" };
const miniBtn: React.CSSProperties = { borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer" };
const box: React.CSSProperties = { border: "1px solid #eee", borderRadius: 12, padding: 12 };
const badge: React.CSSProperties = { padding: "4px 10px", borderRadius: 999, border: "1px solid #ddd", fontSize: 12, background: "#fff" };
