"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { ui } from "@/components/uiStyles";

type Material = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  brand: string | null;
  unit: string | null;
  active: boolean;
  created_at: string;
};

type CartItem = {
  material_id: string;
  name: string;
  unit: string | null;
  qty: number;
};

function ensureMobileCartCSS() {
  if (typeof document === "undefined") return;
  if (document.getElementById("mobile-cart-style")) return;

  const style = document.createElement("style");
  style.id = "mobile-cart-style";
  style.innerHTML = `
    @media (max-width: 820px) {
      .mobileBottomPad { padding-bottom: 84px !important; }
      .desktopCartBtn { display: none !important; }
      .mobileCartBar { display: flex !important; }
    }
    @media (min-width: 821px) {
      .mobileBottomPad { padding-bottom: 0 !important; }
      .desktopCartBtn { display: inline-flex !important; }
      .mobileCartBar { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}

function parseQty(input: string) {
  const v = (input ?? "").trim().replace(",", ".");
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function formatQty(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(3).replace(/\.?0+$/, "");
}

function vibrate(ms = 12) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(ms);
    }
  } catch {
    // ignore
  }
}

function normalizeText(s: string | null | undefined) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function splitTerms(s: string) {
  return normalizeText(s).split(/\s+/).filter(Boolean);
}

function startsWithWord(text: string, term: string) {
  if (!term) return false;
  return text.split(/\s+/).some((w) => w.startsWith(term));
}

function scoreMaterial(m: Material, rawSearch: string) {
  const terms = splitTerms(rawSearch);
  if (terms.length === 0) return 999;

  const name = normalizeText(m.name);
  const code = normalizeText(m.code);
  const category = normalizeText(m.category);
  const brand = normalizeText(m.brand);

  const full = terms.join(" ");

  const allInName = terms.every((t) => name.includes(t));
  const allInCode = terms.every((t) => code.includes(t));
  const allInCategory = terms.every((t) => category.includes(t));
  const allInBrand = terms.every((t) => brand.includes(t));

  if (name.startsWith(full)) return 0;
  if (terms.every((t) => startsWithWord(name, t))) return 1;
  if (allInName) return 2;

  if (code.startsWith(full)) return 3;
  if (allInCode) return 4;

  if (category.startsWith(full)) return 5;
  if (allInCategory) return 6;

  if (brand.startsWith(full)) return 7;
  if (allInBrand) return 8;

  return 99;
}

export default function MagazzinoPage() {
  const [me, setMe] = useState<{ role: string; name: string }>({ role: "", name: "" });
  const [loading, setLoading] = useState(true);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Tutte");

  const [qtyById, setQtyById] = useState<Record<string, string>>({});

  const [customer, setCustomer] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<number | null>(null);

  const cartCount = cart.length;

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2000);
  }

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

  async function loadMaterials(searchText = "", selectedCat = "Tutte") {
    let query = supabase
      .from("materials")
      .select("id,name,code,category,brand,unit,active,created_at")
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(150);

    const s = searchText.trim();
    if (s) {
      query = query.or(
        `name.ilike.%${s}%,code.ilike.%${s}%,category.ilike.%${s}%,brand.ilike.%${s}%`
      );
    }

    if (selectedCat && selectedCat !== "Tutte") {
      query = query.eq("category", selectedCat);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      showToast("Errore caricamento materiali");
      return;
    }

    let list = (data ?? []) as Material[];

    if (s) {
      list = [...list].sort((a, b) => {
        const sa = scoreMaterial(a, s);
        const sb = scoreMaterial(b, s);
        if (sa !== sb) return sa - sb;

        return a.name.localeCompare(b.name, "it", { sensitivity: "base" });
      });
    }

    setMaterials(list);

    setQtyById((prev) => {
      const next = { ...prev };
      for (const m of list) {
        if (next[m.id] === undefined) next[m.id] = "0";
      }
      return next;
    });
  }

  async function loadCategories() {
    const { data, error } = await supabase
      .from("materials")
      .select("category")
      .eq("active", true);

    if (error) {
      console.error(error);
      return;
    }

    const cats = Array.from(
      new Set(
        (data ?? [])
          .map((x: any) => x.category)
          .filter((x: string | null) => !!x && x.trim() !== "")
      )
    ).sort() as string[];

    setCategories(cats);
  }

  function setRowQty(materialId: string, value: string) {
    setQtyById((prev) => ({ ...prev, [materialId]: value }));
  }

  function addToCart(m: Material) {
    const raw = qtyById[m.id] ?? "0";
    const add = parseQty(raw);

    if (add <= 0) {
      showToast("Inserisci una quantità > 0");
      vibrate(15);
      return;
    }

    setCart((prev) => {
      const idx = prev.findIndex((x) => x.material_id === m.id);
      if (idx === -1) {
        return [
          ...prev,
          {
            material_id: m.id,
            name: m.name,
            unit: m.unit ?? null,
            qty: add,
          },
        ];
      }

      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        qty: copy[idx].qty + add,
      };
      return copy;
    });

    setRowQty(m.id, "0");
    vibrate(15);
    showToast("Aggiunto al carrello");
  }

  function updateCartQty(materialId: string, value: string) {
    const n = parseQty(value);
    setCart((prev) =>
      prev
        .map((x) => (x.material_id === materialId ? { ...x, qty: n } : x))
        .filter((x) => x.qty > 0)
    );
  }

  function removeFromCart(materialId: string) {
    setCart((prev) => prev.filter((x) => x.material_id !== materialId));
  }

  async function sendOrder() {
    const c = customer.trim();

    if (!c) {
      showToast("Inserisci il cliente");
      vibrate(20);
      return;
    }

    if (cart.length === 0) {
      showToast("Carrello vuoto");
      vibrate(20);
      return;
    }

    const { data: p, error: ep } = await supabase
      .from("pickups")
      .insert([
        {
          customer: c,
          notes: orderNotes.trim() || "",
          status: "NUOVO",
          created_by: me.name || null,
        },
      ])
      .select("id")
      .single();

    if (ep || !p?.id) {
      console.error(ep);
      showToast("Errore invio ordine");
      return;
    }

    const itemsPayload = cart.map((it) => ({
      pickup_id: p.id,
      name: it.name,
      qty: it.qty,
      unit: it.unit ?? null,
      notes: "",
    }));

    const { error: ei } = await supabase.from("pickup_items").insert(itemsPayload);

    if (ei) {
      console.error(ei);
      showToast("Errore righe ordine");
      return;
    }

    showToast("Ordine inviato ✅");
    vibrate(25);

    setCart([]);
    setCustomer("");
    setOrderNotes("");
    setCartOpen(false);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  useEffect(() => {
    ensureMobileCartCSS();

    (async () => {
      setLoading(true);
      const ok = await fetchMeOrRedirect();
      if (!ok) return;

      await Promise.all([loadMaterials("", "Tutte"), loadCategories()]);
      setLoading(false);

      const ch = supabase
        .channel("realtime-materials-magazzino")
        .on("postgres_changes", { event: "*", schema: "public", table: "materials" }, () => {
          loadMaterials(q, selectedCategory);
          loadCategories();
        })
        .subscribe();

      return () => supabase.removeChannel(ch);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      loadMaterials(q, selectedCategory);
    }, 220);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, selectedCategory]);

  if (loading) {
    return (
      <main style={ui.wrap}>
        <AppHeader title="Magazzino" subtitle="Caricamento…" />
      </main>
    );
  }

  return (
    <main style={ui.wrap} className="mobileBottomPad">
      {toast && <div style={toastStyle}>{toast}</div>}

      <AppHeader
        title="Magazzino"
        subtitle="Ricerca intelligente materiali, quantità decimali e invio all’ufficio"
        right={
          <div style={{ display: "flex", gap: 10 }}>
            <button className="desktopCartBtn" style={ui.btnSoft} onClick={() => setCartOpen(true)}>
              Carrello ({cartCount})
            </button>
            <button style={ui.btnSoft} onClick={logout}>
              Esci
            </button>
          </div>
        }
      />

      <section style={ui.card}>
        <div style={{ display: "grid", gap: 10, maxWidth: 900 }}>
          <label style={ui.lab}>
            Cliente *
            <input
              style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }}
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Nome cliente"
            />
          </label>

          <label style={ui.lab}>
            Note (opz.)
            <input
              style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }}
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="Note per l’ufficio"
            />
          </label>

          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Magazziniere: <b style={{ color: "var(--text)" }}>{me.name}</b>
          </div>
        </div>
      </section>

      <section style={ui.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>Materiali</h2>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Risultati: <b style={{ color: "var(--text)" }}>{materials.length}</b>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <input
            style={{ ...ui.inp, padding: "12px 14px", fontSize: 16, maxWidth: 560 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca per nome, codice, categoria, marca…"
          />

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ ...ui.inp, padding: "12px 14px", fontSize: 16, maxWidth: 260 }}
          >
            <option value="Tutte">Tutte le categorie</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {materials.map((m) => (
            <div
              key={m.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 12,
                background: "white",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{m.name}</div>
                <div style={{ ...ui.badge, opacity: 0.9 }}>{m.unit || "UM"}</div>
              </div>

              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.35 }}>
                {m.code ? (
                  <span>
                    <b>Cod:</b> {m.code}
                  </span>
                ) : null}
                {m.category ? (
                  <span>
                    {m.code ? " · " : ""}
                    <b>Cat:</b> {m.category}
                  </span>
                ) : null}
                {m.brand ? (
                  <span>
                    {m.code || m.category ? " · " : ""}
                    <b>Marca:</b> {m.brand}
                  </span>
                ) : null}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ ...ui.lab, margin: 0 }}>
                  Quantità
                  <input
                    style={{ ...ui.inp, padding: "12px 14px", fontSize: 16, width: 160 }}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={qtyById[m.id] ?? "0"}
                    onChange={(e) => setRowQty(m.id, e.target.value)}
                  />
                </label>

                <button style={{ ...ui.btn, padding: "12px 14px" }} onClick={() => addToCart(m)}>
                  Aggiungi
                </button>
              </div>

              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                Puoi usare anche la virgola (es. <b>1,5</b>).
              </div>
            </div>
          ))}

          {materials.length === 0 && <div style={{ color: "var(--muted)" }}>Nessun materiale trovato.</div>}
        </div>
      </section>

      <div className="mobileCartBar" style={mobileBar}>
        <button style={{ ...ui.btn, padding: "12px 14px", width: "100%" }} onClick={() => setCartOpen(true)}>
          Apri carrello <span style={mobileBadge}>{cartCount}</span>
        </button>
      </div>

      {cartOpen && (
        <div style={modalOverlay} onClick={() => setCartOpen(false)} role="dialog" aria-modal="true">
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Carrello</div>
              <button style={ui.btnSoft} onClick={() => setCartOpen(false)}>
                Chiudi
              </button>
            </div>

            <div style={{ padding: 12, display: "grid", gap: 10 }}>
              {cart.length === 0 ? (
                <div style={{ color: "var(--muted)" }}>Carrello vuoto.</div>
              ) : (
                cart.map((it) => (
                  <div
                    key={it.material_id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 12,
                      background: "white",
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                      <div style={{ fontWeight: 900 }}>{it.name}</div>
                      <div style={{ ...ui.badge, opacity: 0.9 }}>{it.unit || "UM"}</div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <label style={{ ...ui.lab, margin: 0 }}>
                        Quantità
                        <input
                          style={{ ...ui.inp, padding: "12px 14px", fontSize: 16, width: 160 }}
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={formatQty(it.qty)}
                          onChange={(e) => updateCartQty(it.material_id, e.target.value)}
                        />
                      </label>

                      <button style={ui.btnDanger} onClick={() => removeFromCart(it.material_id)}>
                        Rimuovi
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 6 }}>
                <button style={ui.btnSoft} onClick={() => setCart([])} disabled={cart.length === 0}>
                  Svuota
                </button>
                <button style={ui.btn} onClick={sendOrder} disabled={cart.length === 0}>
                  Invia all’ufficio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ===== STILI ===== */

const toastStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  top: 14,
  transform: "translateX(-50%)",
  zIndex: 9999,
  padding: "10px 14px",
  borderRadius: 14,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,.92)",
  backdropFilter: "blur(8px)",
  boxShadow: "var(--shadow)",
  fontWeight: 800,
  color: "var(--text)",
};

const modalOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.45)",
  zIndex: 9999,
  display: "grid",
  placeItems: "center",
  padding: 14,
};

const modalCard: CSSProperties = {
  width: "min(720px, 100%)",
  background: "white",
  borderRadius: 18,
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow)",
  overflow: "hidden",
};

const modalHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  padding: 12,
  background: "linear-gradient(180deg, var(--card), var(--blue-50))",
  borderBottom: "1px solid var(--border)",
};

const mobileBar: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  padding: 12,
  background: "rgba(255,255,255,.92)",
  backdropFilter: "blur(10px)",
  borderTop: "1px solid var(--border)",
  boxShadow: "0 -12px 30px rgba(2, 6, 23, 0.08)",
  zIndex: 9998,
  display: "none",
};

const mobileBadge: CSSProperties = {
  marginLeft: 10,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 28,
  height: 28,
  padding: "0 8px",
  borderRadius: 999,
  fontWeight: 900,
  background: "rgba(255,255,255,.18)",
  border: "1px solid rgba(255,255,255,.35)",
};