"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type Pickup = {
  id: string;
  customer: string;
  status: "NUOVO" | "IN_LAVORAZIONE" | "PRONTO" | "CHIUSO";
  created_by: string | null;
  created_at: string;
};

function ensureGlobalCSS() {
  if (typeof document === "undefined") return;
  if (document.getElementById("materials-global-style")) return;

  const style = document.createElement("style");
  style.id = "materials-global-style";
  style.innerHTML = `
    @keyframes toastIn {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

export default function UfficioMaterialiPage() {
  const [me, setMe] = useState<{ role: string; name: string }>({ role: "", name: "" });
  const [loading, setLoading] = useState(true);

  // form
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [unit, setUnit] = useState("");
  const [active, setActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // lista
  const [materials, setMaterials] = useState<Material[]>([]);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string>("");

  // ✅ contatore nuovi ordini
  const [newOrdersCount, setNewOrdersCount] = useState<number>(0);

  // ✅ preferenze notifica/suono (riprese da localStorage come in ufficio)
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const notifyEnabledRef = useRef(false);
  const soundEnabledRef = useRef(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastNotifiedIdRef = useRef<string>("");

  // toast
  const [toast, setToast] = useState<string>("");
  const toastTimerRef = useRef<number | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return materials;
    return materials.filter((m) => {
      const hay = [m.name, m.code ?? "", m.category ?? "", m.brand ?? "", m.unit ?? ""].join(" ").toLowerCase();
      return hay.includes(s);
    });
  }, [materials, q]);

  function showToast(t: string) {
    setToast(t);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2200);
  }

  function playDing() {
    if (!soundEnabledRef.current) return;
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio("/ding.mp3");
        audioRef.current.preload = "auto";
      }
      audioRef.current.currentTime = 0;
      void audioRef.current.play();
    } catch {
      // ignore
    }
  }

  function sendDesktopNotification(p: Pickup) {
    if (!notifyEnabledRef.current) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    try {
      const body = `Cliente: ${p.customer}${p.created_by ? `\nInserito da: ${p.created_by}` : ""}`;
      new Notification("Nuovo ordine in arrivo", { body });
    } catch {
      // ignore
    }
  }

  async function enableNotificationsAndSound() {
    // abilita suono
    setSoundEnabled(true);

    // sblocca audio con click (necessario su molti browser)
    try {
      const a = new Audio("/ding.mp3");
      a.preload = "auto";
      await a.play().catch(() => {});
      a.pause();
      a.currentTime = 0;
    } catch {
      // ignore
    }

    // abilita notifiche
    if (typeof window !== "undefined" && "Notification" in window) {
      const perm = await Notification.requestPermission().catch(() => "default" as NotificationPermission);
      const ok = perm === "granted";
      setNotifyEnabled(ok);
      try {
        localStorage.setItem("ufficio_notify", ok ? "1" : "0");
        localStorage.setItem("ufficio_sound", "1");
      } catch {}
    } else {
      setNotifyEnabled(false);
      try {
        localStorage.setItem("ufficio_sound", "1");
      } catch {}
    }

    showToast("Notifiche/Suono configurati");
  }

  async function fetchMeOrRedirect() {
    const r = await fetch("/api/me", { cache: "no-store" });
    const j = await r.json().catch(() => ({ role: "", name: "" }));

    if (j.role !== "ufficio") {
      window.location.href = "/login";
      return null;
    }
    setMe({ role: j.role, name: j.name || "" });
    return j as { role: string; name: string };
  }

  async function loadMaterials() {
    const { data, error } = await supabase
      .from("materials")
      .select("id,name,code,category,brand,unit,active,created_at")
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      console.error(error);
      setMsg({ type: "err", text: "Errore nel caricamento materiali" });
      return;
    }
    setMaterials((data ?? []) as Material[]);
  }

  async function loadNewOrdersCount() {
    // count NUOVO
    const { count, error } = await supabase
      .from("pickups")
      .select("id", { head: true, count: "exact" })
      .eq("status", "NUOVO");

    if (error) {
      console.error(error);
      return;
    }
    setNewOrdersCount(count ?? 0);
  }

  async function createMaterial() {
    const n = name.trim();
    if (!n) {
      setMsg({ type: "err", text: "Il nome materiale è obbligatorio." });
      return;
    }

    setSaving(true);
    setMsg(null);

    const payload = {
      name: n,
      code: code.trim() || null,
      category: category.trim() || null,
      brand: brand.trim() || null,
      unit: unit.trim() || null,
      active,
    };

    const { error } = await supabase.from("materials").insert([payload]);
    if (error) {
      console.error(error);
      setMsg({ type: "err", text: `Errore salvataggio: ${error.message}` });
      setSaving(false);
      return;
    }

    setMsg({ type: "ok", text: "Materiale inserito ✅" });

    setName("");
    setCode("");
    setCategory("");
    setBrand("");
    setUnit("");
    setActive(true);

    await loadMaterials();
    setSaving(false);
  }

  async function toggleActive(id: string, next: boolean) {
    setBusyId(id);
    setMsg(null);

    const { error } = await supabase.from("materials").update({ active: next }).eq("id", id);
    if (error) {
      console.error(error);
      setMsg({ type: "err", text: `Errore aggiornamento: ${error.message}` });
      setBusyId("");
      return;
    }

    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, active: next } : m)));
    await loadMaterials();
    setBusyId("");
  }

  // ✅ eliminazione via API server (service role)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  function askDelete(m: Material) {
    setToDelete({ id: m.id, name: m.name });
    setConfirmOpen(true);
  }

  function closeConfirm() {
    if (deleting) return;
    setConfirmOpen(false);
    setToDelete(null);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setBusyId(toDelete.id);
    setMsg(null);

    const r = await fetch("/api/materials/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: toDelete.id }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg({ type: "err", text: `Errore eliminazione: ${j.error || "sconosciuto"}` });
      setDeleting(false);
      setBusyId("");
      return;
    }

    setMsg({ type: "ok", text: "Materiale eliminato." });
    await loadMaterials();

    setDeleting(false);
    setBusyId("");
    setConfirmOpen(false);
    setToDelete(null);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  // init
  useEffect(() => {
    ensureGlobalCSS();

    // carica preferenze salvate dall'ufficio
    try {
      setNotifyEnabled(localStorage.getItem("ufficio_notify") === "1");
      setSoundEnabled(localStorage.getItem("ufficio_sound") === "1");
    } catch {
      // ignore
    }
  }, []);

  // aggiorna refs
  useEffect(() => {
    notifyEnabledRef.current = notifyEnabled;
    soundEnabledRef.current = soundEnabled;
  }, [notifyEnabled, soundEnabled]);

  // carico dati + subscribe realtime (materials + pickups)
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      const ok = await fetchMeOrRedirect();
      if (!ok) return;

      await loadMaterials();
      await loadNewOrdersCount();

      if (!alive) return;
      setLoading(false);

      // realtime su materials
      const chMaterials = supabase
        .channel("realtime-materials-ufficio")
        .on("postgres_changes", { event: "*", schema: "public", table: "materials" }, () => loadMaterials())
        .subscribe();

      // realtime su pickups -> badge + notifica/suono
      const chOrders = supabase
        .channel("realtime-pickups-ufficio")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "pickups" }, (payload) => {
          const p = payload.new as Pickup;

          // anti doppio
          if (lastNotifiedIdRef.current === p.id) return;
          lastNotifiedIdRef.current = p.id;

          // aggiorna contatore subito
          loadNewOrdersCount();

          // notifica/suono anche qui
          playDing();
          sendDesktopNotification(p);

          showToast("Nuovo ordine ricevuto");
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pickups" }, () => {
          loadNewOrdersCount();
        })
        .subscribe();

      // fallback leggero + focus
      const t = window.setInterval(() => loadNewOrdersCount(), 10000);
      const onFocus = () => loadNewOrdersCount();
      window.addEventListener("focus", onFocus);

      return () => {
        window.clearInterval(t);
        window.removeEventListener("focus", onFocus);
        supabase.removeChannel(chMaterials);
        supabase.removeChannel(chOrders);
      };
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC chiude modale delete
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && confirmOpen) closeConfirm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmOpen, deleting]);

  if (loading) {
    return (
      <main style={ui.wrap}>
        <AppHeader title="Materiali" subtitle="Caricamento…" />
      </main>
    );
  }

  return (
    <main style={ui.wrap}>
      {toast && <div style={toastStyle}>{toast}</div>}

      <AppHeader
        title="Materiali"
        subtitle="Ufficio: inserisci e gestisci il catalogo"
        right={
          <div style={{ display: "flex", gap: 10 }}>
            <a
              href="/ufficio"
              style={{ ...ui.btnSoft, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              ← Ufficio
              {newOrdersCount > 0 && <span style={pillBadge}>{newOrdersCount}</span>}
            </a>
            <button style={ui.btnSoft} onClick={logout}>
              Esci
            </button>
          </div>
        }
      />

      {/* piccolo pannello notifiche */}
      <section style={ui.card}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Loggato come: <b style={{ color: "var(--text)" }}>{me.name}</b>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button style={ui.btnSoft} onClick={enableNotificationsAndSound}>
              Abilita notifiche & suono
            </button>

            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              Nuovi ordini: <b style={{ color: "var(--text)" }}>{newOrdersCount}</b> · Notifiche:{" "}
              <b style={{ color: "var(--text)" }}>{notifyEnabled ? "ON" : "OFF"}</b> · Suono:{" "}
              <b style={{ color: "var(--text)" }}>{soundEnabled ? "ON" : "OFF"}</b>
            </div>
          </div>
        </div>
      </section>

      {/* MODALE DELETE */}
      {confirmOpen && toDelete && (
        <div style={modalOverlay} onClick={closeConfirm} role="dialog" aria-modal="true">
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Conferma eliminazione</div>
              <button style={ui.btnSoft} onClick={closeConfirm} disabled={deleting}>
                Chiudi
              </button>
            </div>

            <div style={{ padding: 14 }}>
              <div style={{ color: "var(--muted)", lineHeight: 1.35 }}>Stai per eliminare definitivamente:</div>
              <div style={modalName}>{toDelete.name}</div>
              <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
                Questa operazione è <b>irreversibile</b>.
              </div>

              <div style={modalActions}>
                <button style={ui.btnSoft} onClick={closeConfirm} disabled={deleting}>
                  Annulla
                </button>
                <button
                  style={{ ...ui.btnDanger, padding: "12px 14px", opacity: deleting ? 0.6 : 1 }}
                  onClick={confirmDelete}
                  disabled={deleting}
                >
                  {deleting ? "Eliminazione…" : "Elimina"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FORM */}
      <section style={ui.card}>
        {msg && (
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: msg.type === "ok" ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)",
              color: "var(--text)",
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            {msg.text}
          </div>
        )}

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr", maxWidth: 900 }}>
          <label style={ui.lab}>
            Nome materiale *
            <input
              style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="es. Cemento 25kg"
            />
          </label>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label style={ui.lab}>
              Codice (opz.)
              <input
                style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="es. CEM-25"
              />
            </label>

            <label style={ui.lab}>
              Categoria (opz.)
              <input
                style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="es. Laterizi"
              />
            </label>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label style={ui.lab}>
              Marca (opz.)
              <input
                style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="es. Mapei"
              />
            </label>

            <label style={ui.lab}>
              Unità di misura (opz.)
              <input
                style={{ ...ui.inp, padding: "12px 14px", fontSize: 16 }}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="es. pz / kg / sacco"
              />
            </label>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontWeight: 800 }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Materiale attivo
          </label>

          <button
            style={{ ...ui.btn, padding: "14px 16px", fontSize: 16, opacity: saving ? 0.6 : 1 }}
            onClick={createMaterial}
            disabled={saving}
          >
            {saving ? "Salvataggio…" : "Inserisci materiale"}
          </button>
        </div>
      </section>

      {/* LISTA */}
      <section style={ui.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>Catalogo</h2>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Totale: <b style={{ color: "var(--text)" }}>{materials.length}</b>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <input
            style={{ ...ui.inp, padding: "12px 14px", fontSize: 16, maxWidth: 520 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca per nome, codice, categoria, marca…"
          />

          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((m) => (
              <div
                key={m.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: 12,
                  background: "white",
                  display: "grid",
                  gap: 10,
                  opacity: busyId === m.id ? 0.65 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{m.name}</div>
                  <div style={{ ...ui.badge, opacity: m.active ? 1 : 0.55 }}>{m.active ? "ATTIVO" : "NON ATTIVO"}</div>
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
                  {m.unit ? (
                    <span>
                      {m.code || m.category || m.brand ? " · " : ""}
                      <b>UM:</b> {m.unit}
                    </span>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    style={ui.btnSoft}
                    onClick={() => toggleActive(m.id, !m.active)}
                    disabled={busyId === m.id || deleting}
                  >
                    {m.active ? "Disattiva" : "Attiva"}
                  </button>

                  <button style={ui.btnDanger} onClick={() => askDelete(m)} disabled={busyId === m.id || deleting}>
                    Elimina
                  </button>
                </div>
              </div>
            ))}

            {filtered.length === 0 && <div style={{ color: "var(--muted)" }}>Nessun materiale trovato.</div>}
          </div>
        </div>
      </section>
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
  animation: "toastIn .18s ease-out",
};

const pillBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 22,
  height: 22,
  padding: "0 7px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 12,
  color: "white",
  background: "linear-gradient(135deg, #2563eb, #38bdf8)",
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
  width: "min(560px, 100%)",
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

const modalName: CSSProperties = {
  marginTop: 10,
  padding: 12,
  borderRadius: 14,
  border: "1px solid var(--border)",
  background: "linear-gradient(180deg, var(--card), var(--blue-50))",
  fontWeight: 900,
  color: "var(--text)",
};

const modalActions: CSSProperties = {
  marginTop: 14,
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  flexWrap: "wrap",
};
