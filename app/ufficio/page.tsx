"use client";

import { useEffect, useState } from "react";
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

export default function UfficioPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [pickups, setPickups] = useState<(Pickup & { items: Item[] })[]>([]);

  async function fetchMeOrRedirect() {
    const r = await fetch("/api/me", { cache: "no-store" });
    const j = await r.json().catch(() => ({ role: "" }));
    if (j.role !== "ufficio") {
      window.location.href = "/login";
      return false;
    }
    return true;
  }

  async function loadPickups() {
    const { data: p, error: ep } = await supabase
      .from("pickups")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(300);

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

  async function setStatus(pickupId: string, status: Pickup["status"]) {
    const { error } = await supabase.from("pickups").update({ status }).eq("id", pickupId);
    if (error) console.error(error);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }
  async function deletePickup(pickupId: string) {
    const ok = window.confirm("Sei sicuro di voler eliminare questa richiesta?\nL’operazione è irreversibile.");
    if (!ok) return;
  
    const { error } = await supabase.from("pickups").delete().eq("id", pickupId);
    if (error) {
      console.error(error);
      alert("Errore durante l’eliminazione");
    }
  }
  
  useEffect(() => {
    (async () => {
      setAuthLoading(true);
      const ok = await fetchMeOrRedirect();
      if (!ok) return;

      await loadPickups();
      setAuthLoading(false);

      const ch = supabase
        .channel("realtime-pickups-ufficio")
        .on("postgres_changes", { event: "*", schema: "public", table: "pickups" }, () => loadPickups())
        .on("postgres_changes", { event: "*", schema: "public", table: "pickup_items" }, () => loadPickups())
        .subscribe();

      return () => {
        supabase.removeChannel(ch);
      };
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    { key: "NUOVO", title: "Nuovi" },
    { key: "IN_LAVORAZIONE", title: "In lavorazione" },
    { key: "PRONTO", title: "Pronti" },
    { key: "CHIUSO", title: "Chiusi" },
  ] as const;

  if (authLoading) {
    return (
      <main style={wrap}>
        <h1 style={{ margin: 0 }}>Ufficio</h1>
        <p style={{ color: "#666" }}>Caricamento…</p>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0 }}>Ufficio</h1>
          <p style={{ marginTop: 6, color: "#555" }}>Vedi i prelievi in tempo reale e aggiorna lo stato.</p>
        </div>

        <button style={btn} onClick={logout}>
          Esci
        </button>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
        {columns.map((col) => (
          <section key={col.key} style={colBox}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>{col.title}</div>

            <div style={{ display: "grid", gap: 10 }}>
              {pickups
                .filter((p) => p.status === col.key)
                .map((p) => (
                  <div key={p.id} style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900 }}>{p.customer}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {new Date(p.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>

                    {p.created_by && (
                      <div style={{ marginTop: 6, color: "#555", fontSize: 13 }}>
                        Inserito da: <b>{p.created_by}</b>
                      </div>
                    )}

                    {p.notes && <div style={{ color: "#555", marginTop: 6 }}>Note: {p.notes}</div>}

                    <ul style={{ margin: "10px 0 0 18px" }}>
                      {p.items.map((i) => (
                        <li key={i.id}>
                          {i.qty}× {i.name}
                          {i.notes ? ` — (${i.notes})` : ""}
                        </li>
                      ))}
                    </ul>

                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      {col.key !== "IN_LAVORAZIONE" && (
                        <button style={btnSmall} onClick={() => setStatus(p.id, "IN_LAVORAZIONE")}>
                          In lavorazione
                        </button>
                      )}
                      {col.key !== "PRONTO" && (
                        <button style={btnSmall} onClick={() => setStatus(p.id, "PRONTO")}>
                          Pronto
                        </button>
                      )}
                      {col.key !== "CHIUSO" && (
                        <button style={btnSmall} onClick={() => setStatus(p.id, "CHIUSO")}>
                          Chiuso
                        </button>
                      )}
                      <button
    style={{
      ...btnSmall,
      borderColor: "#e33",
      color: "#e33",
    }}
    onClick={() => deletePickup(p.id)}
  >
    Elimina
  </button>
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
const btn: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer" };
const btnSmall: React.CSSProperties = { padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer" };
