"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Pickup = { id: string; customer: string; notes: string; status: string; created_at: string; };
type Item = { id: string; pickup_id: string; name: string; qty: number; notes: string; created_at: string; };

export default function Ufficio() {
  const [pickups, setPickups] = useState<(Pickup & { items: Item[] })[]>([]);

  async function load() {
    const { data: p, error: ep } = await supabase
      .from("pickups")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(200);

    if (ep) return console.error(ep);

    const ids = (p ?? []).map(x => x.id);
    const { data: it, error: ei } = await supabase
      .from("pickup_items")
      .select("*")
      .in("pickup_id", ids);

    if (ei) return console.error(ei);

    const byPickup = new Map<string, Item[]>();
    (it ?? []).forEach(x => byPickup.set(x.pickup_id, [...(byPickup.get(x.pickup_id) ?? []), x]));

    setPickups((p ?? []).map(x => ({ ...(x as Pickup), items: byPickup.get(x.id) ?? [] })));
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("realtime-pickups")
      .on("postgres_changes", { event: "*", schema: "public", table: "pickups" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_items" }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  async function setStatus(pickupId: string, status: string) {
    const { error } = await supabase.from("pickups").update({ status }).eq("id", pickupId);
    if (error) console.error(error);
  }

  const columns = [
    { key: "NUOVO", title: "Nuovi" },
    { key: "IN_LAVORAZIONE", title: "In lavorazione" },
    { key: "PRONTO", title: "Pronti" },
    { key: "CHIUSO", title: "Chiusi" },
  ] as const;

  return (
    <main style={wrap}>
      <h1 style={{ margin: 0 }}>Ufficio</h1>
      <p style={{ marginTop: 6, color: "#555" }}>
        Vedi i prelievi in tempo reale e aggiorna lo stato.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
        {columns.map(col => (
          <section key={col.key} style={colBox}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>{col.title}</div>

            <div style={{ display: "grid", gap: 10 }}>
              {pickups.filter(p => p.status === col.key).map(p => (
                <div key={p.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>{p.customer}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {new Date(p.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>

                  {p.notes && <div style={{ color: "#555", marginTop: 6 }}>Note: {p.notes}</div>}

                  <ul style={{ margin: "10px 0 0 18px" }}>
                    {p.items.map(i => (
                      <li key={i.id}>
                        {i.qty}× {i.name}{i.notes ? ` — (${i.notes})` : ""}
                      </li>
                    ))}
                  </ul>

                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    {col.key !== "IN_LAVORAZIONE" && <button style={btn} onClick={() => setStatus(p.id, "IN_LAVORAZIONE")}>In lavorazione</button>}
                    {col.key !== "PRONTO" && <button style={btn} onClick={() => setStatus(p.id, "PRONTO")}>Pronto</button>}
                    {col.key !== "CHIUSO" && <button style={btn} onClick={() => setStatus(p.id, "CHIUSO")}>Chiuso</button>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = { padding: 24, fontFamily: "system-ui" };
const colBox: React.CSSProperties = { border: "1px solid #e6e6e6", borderRadius: 14, padding: 12, minHeight: 320 };
const card: React.CSSProperties = { border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" };
const btn: React.CSSProperties = { padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer" };
