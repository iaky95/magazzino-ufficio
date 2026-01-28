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
  qty: number;
  notes: string;
  created_at: string;
};

function ensureBadgeNewAnimationCSS() {
  if (typeof document === "undefined") return;
  if (document.getElementById("badge-new-style")) return;

  const style = document.createElement("style");
  style.id = "badge-new-style";
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
      return 3; // in fondo
    default:
      return 9;
  }
}

export default function UfficioPage() {
  const [me, setMe] = useState<{ role: string; name: string }>({ role: "", name: "" });
  const [loading, setLoading] = useState(true);

  const [pickups, setPickups] = useState<(Pickup & { items: PickupItem[] })[]>([]);

  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const lastNotifiedIdRef = useRef<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ✅ toast
  const [toast, setToast] = useState<string>("");
  const toastTimerRef = useRef<number | null>(null);

  const unreadCount = useMemo(() => pickups.filter((p) => p.status === "NUOVO").length, [pickups]);
  const notifSupported = typeof window !== "undefined" && "Notification" in window;

  const sortedPickups = useMemo(() => {
    const copy = [...pickups];
    copy.sort((a, b) => {
      const ra = statusRank(a.status);
      const rb = statusRank(b.status);
      if (ra !== rb) return ra - rb;

      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return tb - ta;
    });
    return copy;
  }, [pickups]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2200);
  }

  function playDing() {
    if (!soundEnabled) return;
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
    if (!notifyEnabled) return;
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
      .limit(80);

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

    // refresh
    await loadPickups();

    // ✅ toast quando chiuso
    if (status === "CHIUSO") showToast("Ordine spostato in fondo");
  }

  async function deletePickup(pickupId: string) {
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
    loadPickups();
    showToast("Richiesta eliminata");
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  useEffect(() => {
    ensureBadgeNewAnimationCSS();
    try {
      setNotifyEnabled(localStorage.getItem("ufficio_notify") === "1");
      setSoundEnabled(localStorage.getItem("ufficio_sound") === "1");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const ok = await fetchMeOrRedirect();
      if (!ok) return;

      await loadPickups();
      setLoading(false);

      const ch = supabase
        .channel("realtime-ufficio-new-orders")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "pickups" }, (payload) => {
          const p = payload.new as Pickup;

          if (lastNotifiedIdRef.current === p.id) return;
          lastNotifiedIdRef.current = p.id;

          playDing();
          sendDesktopNotification(p);
          loadPickups();

          showToast("Nuovo ordine ricevuto");
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "pickup_items" }, () => loadPickups())
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pickups" }, () => loadPickups())
        .subscribe();

      return () => supabase.removeChannel(ch);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifyEnabled, soundEnabled]);

  if (loading) {
    return (
      <main style={ui.wrap}>
        <AppHeader title="Ufficio" subtitle="Caricamento…" />
      </main>
    );
  }

  return (
    <main style={ui.wrap}>
      {/* ✅ Toast */}
      {toast && <div style={toastStyle}>{toast}</div>}

      <AppHeader
        title="Ufficio"
        subtitle={`Ordini in arrivo. Nuovi: ${unreadCount}`}
        right={
          <button style={ui.btnSoft} onClick={logout}>
            Esci
          </button>
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
              {typeof window !== "undefined" && "Notification" in window ? (
                <>
                  Notifiche: <b style={{ color: "var(--text)" }}>{notifyEnabled ? "ON" : "OFF"}</b> · Suono:{" "}
                  <b style={{ color: "var(--text)" }}>{soundEnabled ? "ON" : "OFF"}</b>
                </>
              ) : (
                <>
                  Notifiche non supportate · Suono: <b style={{ color: "var(--text)" }}>{soundEnabled ? "ON" : "OFF"}</b>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 12 }}>
          Nota: il suono può richiedere un click iniziale (limiti del browser). Il pulsante sopra lo “sblocca”.
        </div>
      </section>

      <section style={ui.card}>
        <h2 style={{ marginTop: 0 }}>Richieste</h2>

        <div style={{ display: "grid", gap: 10 }}>
          {sortedPickups.map((p) => (
            <div
              key={p.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 12,
                background: "white",
                display: "grid",
                gap: 14,
                gridTemplateColumns: p.status === "CHIUSO" ? "1fr 280px" : "1fr",
                alignItems: "start",
              }}
            >
              {/* COLONNA 1 */}
              <div>
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
                      {i.qty}× {i.name}
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

              {/* COLONNA 2 (solo CHIUSO) */}
              {p.status === "CHIUSO" && (
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
              )}
            </div>
          ))}

          {sortedPickups.length === 0 && <div style={{ color: "var(--muted)" }}>Nessuna richiesta.</div>}
        </div>
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
