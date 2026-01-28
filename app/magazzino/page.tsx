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
  materialId: string | null;
  name: string;
  code?: string | null;
  category?: string | null;
  brand?: string | null;
  unit?: string | null;
  qty: number;
  notes: string;
};

function useMedia(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const onChange = () => setMatches(m.matches);
    onChange();
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}

function clampQty(n: number) {
  const x = Number.isFinite(n) ? Math.floor(n) : 0;
  return x < 0 ? 0 : x;
}

function QtyStepper(props: {
  value: number;
  onChange: (next: number) => void;
  min?: number; // default 1
}) {
  const min = props.min ?? 1;
  const v = Math.max(min, Math.floor(props.value || min));

  return (
    <div style={stepperWrap}>
      <button
        type="button"
        style={stepperBtn}
        onClick={() => props.onChange(Math.max(min, v - 1))}
        aria-label="Diminuisci"
      >
        –
      </button>

      <input
        style={stepperInput}
        inputMode="numeric"
        value={String(v)}
        onChange={(e) =>
          props.onChange(Math.max(min, Math.floor(Number(e.target.value) || min)))
        }
      />

      <button
        type="button"
        style={stepperBtn}
        onClick={() => props.onChange(v + 1)}
        aria-label="Aumenta"
      >
        +
      </button>
    </div>
  );
}

export default function MagazzinoPage() {
  const isMobile = useMedia("(max-width: 860px)");

  const [me, setMe] = useState<{ role: string; name: string }>({ role: "", name: "" });
  const [authLoading, setAuthLoading] = useState(true);

  const [customer, setCustomer] = useState("");
  const [pickupNotes, setPickupNotes] = useState("");

  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("Tutte");
  const [onlyActive, setOnlyActive] = useState(true);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualQty, setManualQty] = useState<number>(1);
  const [manualNotes, setManualNotes] = useState("");

  const [pickups, setPickups] = useState<(Pickup & { items: PickupItem[] })[]>([]);
  const [sending, setSending] = useState(false);

  const [cartOpen, setCartOpen] = useState(false);

  // ✅ Quantità "pre-carrello" per ogni materiale (draft)
  const [draftQty, setDraftQty] = useState<Record<string, number>>({});

  const cartCount = useMemo(
    () => cart.reduce((sum, x) => sum + Math.max(0, Math.floor(x.qty || 0)), 0),
    [cart]
  );

  const canSend = useMemo(() => {
    const hasCustomer = customer.trim().length > 0;
    const hasCart = cart.length > 0 && cart.some((x) => x.name.trim().length > 0 && (x.qty ?? 0) > 0);
    const hasName = (me.name ?? "").trim().length > 0;
    return hasCustomer && hasCart && hasName && !sending;
  }, [customer, cart, me.name, sending]);

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();

    return materials.filter((m) => {
      if (onlyActive && !m.active) return false;
      if (category !== "Tutte" && (m.category ?? "") !== category) return false;

      if (!q) return true;

      const hay = [m.name, m.code ?? "", m.category ?? "", m.brand ?? "", m.unit ?? ""]
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

    const cats = Array.from(new Set(list.map((x) => (x.category ?? "").trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
    setCategories(cats);
  }

  async function loadPickups() {
    const { data: p, error: ep } = await supabase
      .from("pickups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (ep) {
      console.error(ep);
      return;
    }

    const ids = (p ?? []).map((x: any) => x.id);
    if (ids.length === 0) {
      setPickups([]);
      return;
    }

    const { data: it, error: ei } = await supabase.from("pickup_items").select("*").in("pickup_id", ids);
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
        .channel("realtime-pickups-magazzino-responsive")
        .on("postgres_changes", { event: "*", schema: "public", table: "pickups" }, () => loadPickups())
        .on("postgres_changes", { event: "*", schema: "public", table: "pickup_items" }, () => loadPickups())
        .on("postgres_changes", { event: "*", schema: "public", table: "materials" }, () => loadMaterials())
        .subscribe();

      return () => supabase.removeChannel(ch);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isMobile) setCartOpen(false);
  }, [isMobile]);

  function getDraft(id: string) {
    return clampQty(draftQty[id] ?? 0);
  }

  function setDraft(id: string, qty: number) {
    const q = clampQty(qty);
    setDraftQty((prev) => ({ ...prev, [id]: q }));
  }

  function addDraftToCart(m: Material) {
    const q = getDraft(m.id);
    if (q <= 0) return;

    setCart((prev) => {
      const idx = prev.findIndex((x) => x.materialId === m.id);
      if (idx < 0) {
        return [
          ...prev,
          {
            materialId: m.id,
            name: m.name,
            code: m.code,
            category: m.category,
            brand: m.brand,
            unit: m.unit,
            qty: q,
            notes: "",
          },
        ];
      }
      const copy = [...prev];
      copy[idx] = { ...copy[idx], qty: q }; // ✅ mette la qty scelta
      return copy;
    });

    // reset draft (così non rimane “sporco”)
    setDraft(m.id, 0);

    if (isMobile) setCartOpen(true);
  }

  function addManualToCart() {
    const name = manualName.trim();
    if (!name) return;

    setCart((prev) => [
      ...prev,
      {
        materialId: null,
        name,
        qty: Math.max(1, Math.floor(manualQty || 1)),
        notes: manualNotes.trim(),
      },
    ]);

    setManualName("");
    setManualQty(1);
    setManualNotes("");
    if (isMobile) setCartOpen(true);
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
      .insert([{ customer: customer.trim(), notes: pickupNotes.trim(), status: "NUOVO", created_by: who }])
      .select("*")
      .single();

    if (e1) {
      console.error(e1);
      alert("Errore durante l’invio");
      setSending(false);
      return;
    }

    const cleanItems = cart
      .filter((x) => x.name.trim().length > 0 && (x.qty ?? 0) > 0)
      .map((x) => ({
        pickup_id: pickup.id,
        name: x.name.trim(),
        qty: Math.max(1, Math.floor(x.qty || 1)),
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

    setCustomer("");
    setPickupNotes("");
    setCart([]);
    setCartOpen(false);

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

  const grid: React.CSSProperties = {
    display: "grid",
    gap: 14,
    gridTemplateColumns: isMobile ? "1fr" : "1.25fr 0.75fr",
    alignItems: "start",
  };

  const stickyCart: React.CSSProperties = isMobile ? {} : { position: "sticky", top: 14 };

  const pickupHeaderGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "320px 1fr",
    gap: 12,
  };

  const filtersGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr 220px 180px",
    gap: 10,
  };

  const CartPanel = (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Carrello</div>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          Totale: <b style={{ color: "var(--text)" }}>{cartCount}</b>
        </div>
      </div>

      <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 14, background: "white" }}>
        {cart.length === 0 ? (
          <div style={{ padding: 14, color: "var(--muted)" }}>Aggiungi dal catalogo.</div>
        ) : (
          <div style={{ padding: 10, display: "grid", gap: 10 }}>
            {cart.map((x, i) => (
              <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontWeight: 900, fontSize: 15, lineHeight: 1.2 }}>{x.name}</div>
                  <button style={ui.btnDanger} onClick={() => removeCartLine(i)}>
                    Rimuovi
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "160px 1fr", gap: 10, marginTop: 10 }}>
                  <label style={ui.lab}>
                    Q.tà
                    <QtyStepper
                      value={Math.max(1, Math.floor(x.qty || 1))}
                      onChange={(next) => updateCartLine(i, { qty: Math.max(1, Math.floor(next || 1)) })}
                      min={1}
                    />
                  </label>

                  <label style={ui.lab}>
                    Note riga (opz.)
                    <input
                      style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }}
                      value={x.notes}
                      onChange={(e) => updateCartLine(i, { notes: e.target.value })}
                      placeholder="es. variante, misura…"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <button
          style={{ ...ui.btn, padding: "14px 16px", fontSize: 16, opacity: canSend ? 1 : 0.5 }}
          disabled={!canSend}
          onClick={sendPickup}
        >
          {sending ? "Invio…" : "Invia all’ufficio"}
        </button>

        <button
          style={{ ...ui.btnSoft, padding: "12px 14px" }}
          onClick={() => setCart([])}
          disabled={cart.length === 0}
        >
          Svuota carrello
        </button>
      </div>
    </div>
  );

  return (
    <main style={ui.wrap}>
      <AppHeader
        title="Magazzino"
        subtitle="Scegli quantità dal catalogo, poi conferma con Aggiungi."
        right={<button style={ui.btnSoft} onClick={logout}>Esci</button>}
      />

      <section style={ui.card}>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
          Loggato come: <b style={{ color: "var(--text)" }}>{me.name}</b>
        </div>

        <div style={pickupHeaderGrid}>
          <label style={ui.lab}>
            Cliente
            <input style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="es. Rossi SRL" />
          </label>

          <label style={ui.lab}>
            Note prelievo (opz.)
            <input style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }} value={pickupNotes} onChange={(e) => setPickupNotes(e.target.value)} placeholder="es. urgente / riferimento" />
          </label>
        </div>
      </section>

      <section style={ui.card}>
        <div style={grid}>
          {/* CATALOGO */}
          <div>
            <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 16 }}>Catalogo materiali</div>

            <div style={filtersGrid}>
              <input style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca per nome, codice, categoria, marca…" />

              <select style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="Tutte">Tutte le categorie</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px", color: "var(--muted)" }}>
                <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
                Solo attivi
              </label>
            </div>

            <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "white" }}>
              <div style={{ padding: 10, background: "linear-gradient(180deg, var(--card), var(--blue-50))", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontSize: 13 }}>
                Risultati: <b style={{ color: "var(--text)" }}>{filteredMaterials.length}</b>
              </div>

              <div style={{ maxHeight: isMobile ? 360 : 460, overflow: "auto" }}>
                {filteredMaterials.map((m) => {
                  const disabled = onlyActive && !m.active;
                  const q = getDraft(m.id);

                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
                        gap: 10,
                        padding: 12,
                        borderBottom: "1px solid var(--border)",
                        alignItems: "center",
                        opacity: m.active ? 1 : 0.55,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 16 }}>{m.name}</div>
                        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4, lineHeight: 1.35 }}>
                          {m.code ? <span><b>Cod:</b> {m.code}</span> : null}
                          {m.category ? <span>{m.code ? " · " : ""}<b>Cat:</b> {m.category}</span> : null}
                          {m.brand ? <span>{(m.code || m.category) ? " · " : ""}<b>Marca:</b> {m.brand}</span> : null}
                          {m.unit ? <span>{(m.code || m.category || m.brand) ? " · " : ""}<b>UM:</b> {m.unit}</span> : null}
                        </div>
                      </div>

                      {/* ✅ scegli qty prima + conferma con Aggiungi */}
                      <div style={{ display: "grid", gap: 8, justifyItems: isMobile ? "start" : "end" }}>
                        <div style={miniStepperWrap}>
                          <button style={miniStepBtn} onClick={() => setDraft(m.id, q - 1)} disabled={disabled} aria-label="Diminuisci">–</button>
                          <div style={miniStepQty}>{q}</div>
                          <button style={miniStepBtn} onClick={() => setDraft(m.id, q + 1)} disabled={disabled} aria-label="Aumenta">+</button>
                        </div>

                        <button
                          style={{ ...ui.btnSmall, padding: "10px 12px", fontSize: 14, whiteSpace: "nowrap", opacity: q > 0 ? 1 : 0.45 }}
                          onClick={() => addDraftToCart(m)}
                          disabled={disabled || q <= 0}
                        >
                          Aggiungi
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredMaterials.length === 0 && (
                  <div style={{ padding: 14, color: "var(--muted)" }}>Nessun materiale trovato.</div>
                )}
              </div>
            </div>

            {/* MANUALE */}
            <div style={{ marginTop: 12, padding: 12, border: "1px dashed var(--border)", borderRadius: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Aggiunta manuale</div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 160px 1fr auto", gap: 10 }}>
                <input style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }} value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Nome materiale" />

                <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
                  Quantità
                  <QtyStepper value={manualQty} onChange={(n) => setManualQty(Math.max(1, Math.floor(n || 1)))} min={1} />
                </label>

                <input style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }} value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} placeholder="Note (opz.)" />

                <button style={ui.btnSoft} onClick={addManualToCart}>Aggiungi</button>
              </div>
            </div>

            {isMobile && <div style={{ height: 86 }} />}
          </div>

          {/* CARRELLO (desktop/tablet) */}
          {!isMobile && <div style={stickyCart}>{CartPanel}</div>}
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

      {/* BARRA MOBILE + DRAWER */}
      {isMobile && (
        <>
          <div style={mobileBar}>
            <button style={{ ...ui.btnSoft, width: "100%", padding: "14px 16px", fontSize: 16 }} onClick={() => setCartOpen(true)}>
              Apri carrello ({cartCount})
            </button>
          </div>

          {cartOpen && (
            <div style={drawerOverlay} onClick={() => setCartOpen(false)} role="dialog" aria-modal="true">
              <div style={drawerPanel} onClick={(e) => e.stopPropagation()}>
                <div style={drawerHeader}>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Carrello</div>
                  <button style={ui.btnSoft} onClick={() => setCartOpen(false)}>Chiudi</button>
                </div>
                <div style={drawerBody}>{CartPanel}</div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

/* ====== STILI ====== */

const stepperWrap: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "44px 1fr 44px",
  gap: 8,
  alignItems: "center",
};

const stepperBtn: React.CSSProperties = {
  padding: "10px 0",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "linear-gradient(180deg, var(--card), var(--blue-50))",
  color: "var(--blue-700)",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
};

const stepperInput: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  fontSize: 16,
  outline: "none",
  textAlign: "center",
  background: "white",
};

// mini stepper nel catalogo (pre-carrello)
const miniStepperWrap: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "42px 46px 42px",
  gap: 8,
  alignItems: "center",
  padding: 6,
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "linear-gradient(180deg, var(--card), var(--blue-50))",
};

const miniStepBtn: React.CSSProperties = {
  height: 38,
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "white",
  cursor: "pointer",
  fontSize: 18,
  fontWeight: 900,
  color: "var(--blue-700)",
  lineHeight: 1,
};

const miniStepQty: React.CSSProperties = {
  textAlign: "center",
  fontWeight: 900,
  color: "var(--text)",
  fontSize: 14,
};

const mobileBar: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  padding: 12,
  background: "rgba(246,250,255,0.92)",
  borderTop: "1px solid var(--border)",
  backdropFilter: "blur(8px)",
  zIndex: 50,
};

const drawerOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.45)",
  zIndex: 60,
  display: "grid",
  alignItems: "end",
};

const drawerPanel: React.CSSProperties = {
  background: "var(--bg)",
  borderTopLeftRadius: 18,
  borderTopRightRadius: 18,
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow)",
  maxHeight: "92vh",
  overflow: "hidden",
};

const drawerHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  padding: 12,
  background: "linear-gradient(180deg, var(--card), var(--blue-50))",
  borderBottom: "1px solid var(--border)",
};

const drawerBody: React.CSSProperties = {
  padding: 12,
  overflow: "auto",
  maxHeight: "calc(92vh - 62px)",
};
