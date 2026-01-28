"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { ui } from "@/components/uiStyles";

type PickupStatus = "NUOVO" | "IN_LAVORAZIONE" | "PRONTO" | "CHIUSO";

type Pickup = {
  id: string;
  customer: string;
  notes: string;
  status: PickupStatus;
  created_by: string | null;
  created_at: string;
};

type PickupItem = {
  id: string;
  pickup_id: string;
  name: string;
  qty: number;
  notes: string;
  created_at: string;
};

type Material = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  brand: string | null;
  unit: string | null;
  active: boolean;
};

type CartLine = {
  // “id” è quello del materiale, se selezionato dal catalogo; se inserito manualmente è null
  materialId: string | null;
  name: string;
  code?: string | null;
  category?: string | null;
  brand?: string | null;
  unit?: string | null;
  qty: number;
  notes: string;
};

export default function MagazzinoPage() {
  const [me, setMe] = useState<{ role: string; name: string }>({ role: "", name: "" });
  const [authLoading, setAuthLoading] = useState(true);

  // intestazione prelievo
  const [customer, setCustomer] = useState("");
  const [pickupNotes, setPickupNotes] = useState("");

  // catalogo
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("Tutte");
  const [onlyActive, setOnlyActive] = useState(true);

  // carrello
  const [cart, setCart] = useState<CartLine[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualQty, setManualQty] = useState<number>(1);
  const [manualNotes, setManualNotes] = useState("");

  // storico
  const [pickups, setPickups] = useState<(Pickup & { items: PickupItem[] })[]>([]);

  const [sending, setSending] = useState(false);

  const canSend = useMemo(() => {
    const hasCustomer = customer.trim().length > 0;
    const hasCart = cart.length > 0 && cart.some((x) => x.name.trim().length > 0);
    const hasName = (me.name ?? "").trim().length > 0;
    return hasCustomer && hasCart && hasName && !sending;
  }, [customer, cart, me.name, sending]);

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();

    return materials.filter((m) => {
      if (onlyActive && !m.active) return false;
      if (category !== "Tutte" && (m.category ?? "") !== category) return false;

      if (!q) return true;

      const hay = [
        m.name,
        m.code ?? "",
        m.category ?? "",
        m.brand ?? "",
        m.unit ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [materials, search, category, onlyActive]);

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
    // prendiamo anche inattivi per poterli cercare se disabiliti “solo attivi”
    const { data, error } = await supabase
      .from("materials")
      .select("id,name,code,category,brand,unit,active")
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    const list = (data ?? []) as Material[];
    setMaterials(list);

    const cats = Array.from(
      new Set(list.map((x) => (x.category ?? "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    setCategories(cats);
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

    const byPickup = new Map<string, PickupItem[]>();
    (it ?? []).forEach((x: any) => {
      byPickup.set(x.pickup_id, [...(byPickup.get(x.pickup_id) ?? []), x as PickupItem]);
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
        .channel("realtime-pickups-magazzino-shop")
        .on("postgres_changes", { event: "*", schema: "public", table: "pickups" }, () => loadPickups())
        .on("postgres_changes", { event: "*", schema: "public", table: "pickup_items" }, () => loadPickups())
        .on("postgres_changes", { event: "*", schema: "public", table: "materials" }, () => loadMaterials())
        .subscribe();

      return () => supabase.removeChannel(ch);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addToCart(m: Material) {
    setCart((prev) => {
      // se esiste già, incremento qty
      const idx = prev.findIndex((x) => x.materialId === m.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: (copy[idx].qty ?? 1) + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          materialId: m.id,
          name: m.name,
          code: m.code,
          category: m.category,
          brand: m.brand,
          unit: m.unit,
          qty: 1,
          notes: "",
        },
      ];
    });
  }

  function addManualToCart() {
    const name = manualName.trim();
    if (!name) return;

    setCart((prev) => [
      ...prev,
      {
        materialId: null,
        name,
        qty: manualQty > 0 ? manualQty : 1,
        notes: manualNotes.trim(),
      },
    ]);

    setManualName("");
    setManualQty(1);
    setManualNotes("");
  }

  function updateCartLine(i: number, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function removeCartLine(i: number) {
    setCart((prev) => prev.filter((_, idx) => idx !== i));
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
      alert("Errore durante l’invio");
      setSending(false);
      return;
    }

    const cleanItems = cart
      .filter((x) => x.name.trim().length > 0)
      .map((x) => ({
        pickup_id: pickup.id,
        name: x.name.trim(),
        qty: Number(x.qty) > 0 ? Number(x.qty) : 1,
        // puoi includere “codice/categoria” dentro la nota in modo leggibile
        notes: [
          x.notes?.trim() || "",
          x.code ? `Cod: ${x.code}` : "",
          x.category ? `Cat: ${x.category}` : "",
          x.brand ? `Marca: ${x.brand}` : "",
          x.unit ? `UM: ${x.unit}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
      }));

    const { error: e2 } = await supabase.from("pickup_items").insert(cleanItems);

    if (e2) {
      console.error(e2);
      alert("Errore salvataggio materiali");
      setSending(false);
      return;
    }

    // reset
    setCustomer("");
    setPickupNotes("");
    setCart([]);

    await loadPickups();
    setSending(false);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (authLoading) {
    return (
      <main style={ui.wrap}>
        <AppHeader title="Magazzino" subtitle="Caricamento…" />
      </main>
    );
  }

  return (
    <main style={ui.wrap}>
      <AppHeader
        title="Magazzino"
        subtitle="Seleziona materiali dal catalogo (stile carrello) e invia all’ufficio."
        right={<button style={ui.btnSoft} onClick={logout}>Esci</button>}
      />

      {/* INTESTAZIONE PRELIEVO */}
      <section style={ui.card}>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
          Loggato come: <b style={{ color: "var(--text)" }}>{me.name}</b>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
          <label style={ui.lab}>
            Cliente
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              style={ui.inp}
              placeholder="es. Rossi SRL"
            />
          </label>

          <label style={ui.lab}>
            Note prelievo (opz.)
            <input
              value={pickupNotes}
              onChange={(e) => setPickupNotes(e.target.value)}
              style={ui.inp}
              placeholder="es. urgente / consegna / riferimento"
            />
          </label>
        </div>
      </section>

      {/* SHOP + CARRELLO */}
      <section style={ui.card}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14 }}>
          {/* CATALOGO */}
          <div>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Catalogo materiali</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 180px", gap: 10 }}>
              <input
                style={ui.inp}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per nome, codice, categoria, marca…"
              />

              <select
                style={ui.inp}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="Tutte">Tutte le categorie</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px", color: "var(--muted)" }}>
                <input
                  type="checkbox"
                  checked={onlyActive}
                  onChange={(e) => setOnlyActive(e.target.checked)}
                />
                Solo attivi
              </label>
            </div>

            <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "white" }}>
              <div style={{ padding: 10, background: "linear-gradient(180deg, var(--card), var(--blue-50))", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontSize: 13 }}>
                Risultati: <b style={{ color: "var(--text)" }}>{filteredMaterials.length}</b>
              </div>

              <div style={{ maxHeight: 420, overflow: "auto" }}>
                {filteredMaterials.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      padding: 10,
                      borderBottom: "1px solid var(--border)",
                      alignItems: "center",
                      opacity: m.active ? 1 : 0.55,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900 }}>{m.name}</div>
                      <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                        {m.code ? <span><b>Cod:</b> {m.code}</span> : null}
                        {m.category ? <span>{m.code ? " · " : ""}<b>Cat:</b> {m.category}</span> : null}
                        {m.brand ? <span>{(m.code || m.category) ? " · " : ""}<b>Marca:</b> {m.brand}</span> : null}
                        {m.unit ? <span>{(m.code || m.category || m.brand) ? " · " : ""}<b>UM:</b> {m.unit}</span> : null}
                      </div>
                    </div>

                    <button
                      style={{ ...ui.btnSmall, whiteSpace: "nowrap" }}
                      onClick={() => addToCart(m)}
                      disabled={onlyActive && !m.active}
                      title="Aggiungi al carrello"
                    >
                      + Aggiungi
                    </button>
                  </div>
                ))}

                {filteredMaterials.length === 0 && (
                  <div style={{ padding: 14, color: "var(--muted)" }}>
                    Nessun materiale trovato. Prova a cambiare ricerca/filtri.
                  </div>
                )}
              </div>
            </div>

            {/* AGGIUNTA MANUALE */}
            <div style={{ marginTop: 12, padding: 12, border: "1px dashed var(--border)", borderRadius: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Aggiunta manuale (se non è in elenco)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 1fr auto", gap: 10 }}>
                <input
                  style={ui.inp}
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Nome materiale"
                />
                <input
                  style={ui.inp}
                  type="number"
                  min={1}
                  value={manualQty}
                  onChange={(e) => setManualQty(Number(e.target.value))}
                />
                <input
                  style={ui.inp}
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Note (opz.)"
                />
                <button style={ui.btnSoft} onClick={addManualToCart}>Aggiungi</button>
              </div>
            </div>
          </div>

          {/* CARRELLO */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontWeight: 900 }}>Carrello</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Righe: <b style={{ color: "var(--text)" }}>{cart.length}</b>
              </div>
            </div>

            <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 14, background: "white" }}>
              {cart.length === 0 ? (
                <div style={{ padding: 14, color: "var(--muted)" }}>
                  Nessun materiale nel carrello. Aggiungi dal catalogo.
                </div>
              ) : (
                <div style={{ padding: 10, display: "grid", gap: 10 }}>
                  {cart.map((x, i) => (
                    <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 900 }}>{x.name}</div>
                        <button style={ui.btnDanger} onClick={() => removeCartLine(i)}>Rimuovi</button>
                      </div>

                      <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                        {x.code ? <span><b>Cod:</b> {x.code}</span> : null}
                        {x.category ? <span>{x.code ? " · " : ""}<b>Cat:</b> {x.category}</span> : null}
                        {x.brand ? <span>{(x.code || x.category) ? " · " : ""}<b>Marca:</b> {x.brand}</span> : null}
                        {x.unit ? <span>{(x.code || x.category || x.brand) ? " · " : ""}<b>UM:</b> {x.unit}</span> : null}
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, marginTop: 10 }}>
                        <label style={ui.lab}>
                          Q.tà
                          <input
                            style={ui.inp}
                            type="number"
                            min={1}
                            value={x.qty}
                            onChange={(e) => updateCartLine(i, { qty: Number(e.target.value) })}
                          />
                        </label>

                        <label style={ui.lab}>
                          Note riga (opz.)
                          <input
                            style={ui.inp}
                            value={x.notes}
                            onChange={(e) => updateCartLine(i, { notes: e.target.value })}
                            placeholder="es. colore, misura, variante…"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <button
                style={{ ...ui.btn, opacity: canSend ? 1 : 0.5 }}
                disabled={!canSend}
                onClick={sendPickup}
                title={!canSend ? "Inserisci Cliente e almeno 1 riga nel carrello" : "Invia all'ufficio"}
              >
                {sending ? "Invio…" : "Invia all’ufficio"}
              </button>

              <button
                style={ui.btnSoft}
                onClick={() => setCart([])}
                disabled={cart.length === 0}
              >
                Svuota carrello
              </button>
            </div>

            <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 12 }}>
              Nota: Codice/Categoria/Marca/UM vengono salvati nelle note riga così l’ufficio li vede anche se non gestisce il catalogo.
            </div>
          </div>
        </div>
      </section>

      {/* STORICO */}
      <section style={ui.card}>
        <h2 style={{ marginTop: 0 }}>Ultimi prelievi</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {pickups.map((p) => (
            <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "white" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>{p.customer}</div>
                <div style={ui.badge}>{p.status}</div>
              </div>

              <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>
                Inserito da: <b style={{ color: "var(--text)" }}>{p.created_by || "—"}</b>
              </div>

              {p.notes && <div style={{ color: "var(--muted)", marginTop: 6 }}>Note: {p.notes}</div>}

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
