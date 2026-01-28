"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
  qty: any; // numeric può arrivare anche come stringa in alcune config
  notes: string;
  created_at: string;
};

function ensureGlobalCSS() {
  if (typeof document === "undefined") return;
  if (document.getElementById("ufficio-global-style")) return;

  const style = document.createElement("style");
  style.id = "ufficio-global-style";
  style.innerHTML = `
    @keyframes pulseNew {
      0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(56,189,248,.55); }
      70%  { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(56,189,248,0); }
      100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(56,189,248,0); }
    }
    @keyframes toastIn {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

function statusRank(s: PickupStatus) {
  switch (s) {
    case "NUOVO":
      return 0;
    case "IN_LAVORAZIONE":
      return 1;
    case "PRONTO":
      return 2;
    case "CHIUSO":
      return 3;
    default:
      return 9;
  }
}

function toNum(v: any) {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function formatQty(v: any) {
  const n = toNum(v);
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(3).replace(/\.?0+$/, "");
}

export default function UfficioPage() {
  const [me, setMe] = useState<{ role: string; name: string }>({ role: "", name: "" });
  const [loading, setLoading] = useState(true);

  const [pickups, setPickups] = useState<(Pickup & { items: PickupItem[] })[]>([]);

  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  // refs per non dover risottoscrivere il realtime quando cambi toggle
  const notifyEnabledRef = useRef(false);
  const soundEnabledRef = useRef(false);

  // sezione chiusi
  const [closedOpen, setClosedOpen] = useState(false);

  // anti-duplicati notifica
  const lastNotifiedIdRef = useRef<string>("");

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // toast
  const [toast, setToast] = useState<string>("");
  const toastTimerRef = useRef<number | null>(null);

  const notifSupported = typeof window !== "undefined" && "Notification" in window;

  const unreadCount = useMemo(() => pickups.filter((p) => p.status === "NUOVO").length, [pickups]);

  const openPickups = useMemo(() => {
    const list = pickups.filter((p) => p.status !== "CHIUSO");
    list.sort((a, b) => {
      const ra = statusRank(a.status);
      const rb = statusRank(b.status);
      if (ra !== rb) return ra - rb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [pickups]);

  const closedPickups = useMemo(() => {
    const list = pickups.filter((p) => p.status === "CHIUSO");
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list;
  }, [pickups]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2200);
  }

  function playDing() {
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

    // sblocca audio con click
    try {
      const a = new Audio("/ding.mp3");
      a.preload = "auto";
      a.volume = 1;
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
      } catch {
        // ignore
      }
    } else {
      setNotifyEnabled(false);
      try {
        localStorage.setItem("ufficio_sound", "1");
      } catch {
        // ignore
      }
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

  async function loadPickups() {
    const { data: p, error: ep } = await supabase
      .from("pickups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(180);

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

  async function setStatus(pickupId: string, status: PickupStatus) {
    const { error } = await supabase.from("pickups").update({ status }).eq("id", pickupId);
    if (error) {
      console.error(error);
      alert("Errore aggiornamento stato");
      return;
    }

    await loadPickups();

    if (status === "CHIUSO") showToast("Ordine spostato nei chiusi");
  }

  async function deletePickup(pickupId: string) {
    const ok = window.confirm("Vuoi eliminare questa richiesta? (irreversibile)");
    if (!ok) return;

    const { error: e1 } = await supabase.from("pickup_items").delete().eq("pickup_id", pickupId);
    if (e1) {
      console.error(e1);
      alert("Errore eliminazione righe");
      return;
    }
    const { error: e2 } = await supabase.from("pickups").delete().eq("id", pickupId);
    if (e2) {
      console.error(e2);
      alert("Errore eliminazione richiesta");
      return;
    }
    await loadPickups();
    showToast("Richiesta eliminata");
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  // carica preferenze notify/sound
  useEffect(() => {
    ensureGlobalCSS();
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

  // ✅ realtime STABILE + polling fallback
  useEffect(() => {
    let alive = true;
    let cleanup: null | (() => void) = null;

    (async () => {
      setLoading(true);
      const ok = await fetchMeOrRedirect();
      if (!ok) return;

      await loadPickups();
      if (!alive) return;
      setLoading(false);

      const ch = supabase
        .channel("realtime-ufficio-orders")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "pickups" }, (payload) => {
          const p = payload.new as Pickup;

          // evita doppio evento
          if (lastNotifiedIdRef.current === p.id) return;
          lastNotifiedIdRef.current = p.id;

          // suono/notifica in base ai toggle (via ref)
          if (soundEnabledRef.current) playDing();
          if (notifyEnabledRef.current) sendDesktopNotification(p);

          loadPickups();
          showToast("Nuovo ordine ricevuto");
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pickups" }, () => {
          loadPickups();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "pickup_items" }, () => {
          loadPickups();
        })
        .subscribe();

      // fallback: polling leggero (tab in background / rete ballerina)
      const t = window.setInterval(() => {
        loadPickups();
      }, 10000);

      const onFocus = () => loadPickups();
      window.addEventListener("focus", onFocus);

      cleanup = () => {
        window.clearInterval(t);
        window.removeEventListener("focus", onFocus);
        supabase.removeChannel(ch);
      };
    })();

    return () => {
      alive = false;
      if (cleanup) cleanup();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <main style={ui.wrap}>
        <AppHeader title="Ufficio" subtitle="Caricamento…" />
      </main>
    );
  }

  return (
    <main style={ui.wrap}>
      {toast && <div style={toastStyle}>{toast}</div>}

      <AppHeader
        title="Ufficio"
        subtitle={`Ordini in arrivo. Nuovi: ${unreadCount}`}
        right={
          <div style={{ display: "flex", gap: 10 }}>
            <a
              href="/ufficio/materiali"
              style={{ ...ui.btnSoft, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              Materiali
            </a>
            <button style={ui.btnSoft} onClick={logout}>
              Esci
            </button>
          </div>
        }
      />

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
              {notifSupported ? (
                <>
                  Notifiche: <b style={{ color: "var(--text)" }}>{notifyEnabled ? "ON" : "OFF"}</b> · Suono:{" "}
                  <b style={{ color: "var(--text)" }}>{soundEnabled ? "ON" : "OFF"}</b>
                </>
              ) : (
                <>
                  Notifiche non supportate · Suono:{" "}
                  <b style={{ color: "var(--text)" }}>{soundEnabled ? "ON" : "OFF"}</b>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 12 }}>
          Nota: il suono può richiedere un click iniziale (limiti del browser). Il pulsante sopra lo “sblocca”.
        </div>
      </section>

      {/* ORDINI APERTI */}
      <section style={ui.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>Ordini aperti</h2>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Totale: <b style={{ color: "var(--text)" }}>{openPickups.length}</b>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {openPickups.map((p) => (
            <div
              key={p.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 12,
                background: "white",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <div style={badgeWrap}>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{p.customer}</div>
                  {p.status === "NUOVO" && <span style={badgeNew}>NUOVO</span>}
                </div>
                <div style={ui.badge}>{p.status}</div>
              </div>

              <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>
                Inserito da: <b style={{ color: "var(--text)" }}>{p.created_by || "—"}</b>
              </div>

              {p.notes && <div style={{ marginTop: 6, color: "var(--muted)" }}>Note: {p.notes}</div>}

              <ul style={{ margin: "10px 0 0 18px" }}>
                {p.items.map((i) => (
                  <li key={i.id}>
                    {formatQty(i.qty)}× {i.name}
                    {i.notes ? ` — (${i.notes})` : ""}
                  </li>
                ))}
              </ul>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <button style={ui.btnSoft} onClick={() => setStatus(p.id, "IN_LAVORAZIONE")}>
                  In lavorazione
                </button>
                <button style={ui.btnSoft} onClick={() => setStatus(p.id, "PRONTO")}>
                  Pronto
                </button>
                <button style={ui.btnSoft} onClick={() => setStatus(p.id, "CHIUSO")}>
                  Chiuso
                </button>
                <button style={ui.btnDanger} onClick={() => deletePickup(p.id)}>
                  Elimina
                </button>
              </div>
            </div>
          ))}

          {openPickups.length === 0 && <div style={{ color: "var(--muted)" }}>Nessun ordine aperto.</div>}
        </div>
      </section>

      {/* ORDINI CHIUSI */}
      <section style={ui.card}>
        <button
          type="button"
          onClick={() => setClosedOpen((v) => !v)}
          style={{
            width: "100%",
            textAlign: "left",
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <h2 style={{ margin: 0 }}>
              Ordini chiusi{" "}
              <span style={{ color: "var(--muted)", fontWeight: 700, fontSize: 14 }}>({closedPickups.length})</span>
            </h2>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>{closedOpen ? "Nascondi ▲" : "Mostra ▼"}</div>
          </div>
        </button>

        {closedOpen && (
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {closedPickups.map((p) => (
              <div
                key={p.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: 12,
                  background: "white",
                  display: "grid",
                  gap: 14,
                  gridTemplateColumns: "1fr 280px",
                  alignItems: "start",
                }}
              >
                {/* colonna 1 */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{p.customer}</div>
                    <div style={ui.badge}>{p.status}</div>
                  </div>

                  <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>
                    Inserito da: <b style={{ color: "var(--text)" }}>{p.created_by || "—"}</b>
                  </div>

                  {p.notes && <div style={{ marginTop: 6, color: "var(--muted)" }}>Note: {p.notes}</div>}

                  <ul style={{ margin: "10px 0 0 18px" }}>
                    {p.items.map((i) => (
                      <li key={i.id}>
                        {formatQty(i.qty)}× {i.name}
                        {i.notes ? ` — (${i.notes})` : ""}
                      </li>
                    ))}
                  </ul>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                    <button style={ui.btnSoft} onClick={() => setStatus(p.id, "IN_LAVORAZIONE")}>
                      Riapri (in lavorazione)
                    </button>
                    <button style={ui.btnDanger} onClick={() => deletePickup(p.id)}>
                      Elimina
                    </button>
                  </div>
                </div>

                {/* colonna 2 */}
                <div
                  style={{
                    borderLeft: "1px dashed var(--border)",
                    paddingLeft: 12,
                    display: "grid",
                    gap: 10,
                    color: "var(--muted)",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 900, color: "var(--text)" }}>Ordine chiuso</div>
                  <div>
                    Cliente: <b style={{ color: "var(--text)" }}>{p.customer}</b>
                  </div>
                  <div>
                    Inserito da: <b style={{ color: "var(--text)" }}>{p.created_by || "—"}</b>
                  </div>
                  <div style={{ fontSize: 12 }}>
                    Stato finale: <b>{p.status}</b>
                  </div>
                  <div style={{ fontSize: 12 }}>(Spazio pronto per note finali / archivio)</div>
                </div>
              </div>
            ))}

            {closedPickups.length === 0 && <div style={{ color: "var(--muted)" }}>Nessun ordine chiuso.</div>}
          </div>
        )}
      </section>
    </main>
  );
}

/* ====== STILI ====== */

const badgeWrap: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const badgeNew: CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  color: "white",
  background: "linear-gradient(135deg, #2563eb, #38bdf8)",
  animation: "pulseNew 1.6s infinite",
};

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
