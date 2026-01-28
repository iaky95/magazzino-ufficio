"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

export default function UfficioPage() {
  const [me, setMe] = useState<{ role: string; name: string }>({ role: "", name: "" });
  const [loading, setLoading] = useState(true);

  const [pickups, setPickups] = useState<(Pickup & { items: PickupItem[] })[]>([]);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  // per evitare “spam” notifiche su reload/realtime
  const lastNotifiedIdRef = useRef<string>("");

  // audio (suono nuovo ordine)
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const unreadCount = useMemo(() => pickups.filter((p) => p.status === "NUOVO").length, [pickups]);

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
      .limit(50);

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

  function playDing() {
    if (!soundEnabled) return;
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio("/ding.mp3");
        audioRef.current.preload = "auto";
      }
      // reset to start
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
      new Notification("Nuovo ordine in arrivo", {
        body,
        // se vuoi icona notifica: metti /icon.png in public e sblocca qui
        // icon: "/icon.png",
      });
    } catch {
      // ignore
    }
  }

  async function enableNotificationsAndSound() {
    // abilita suono (serve un click per sbloccare l’audio su molti browser)
    setSoundEnabled(true);
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
      setNotifyEnabled(perm === "granted");
      // salva preferenze
      localStorage.setItem("ufficio_notify", perm === "granted" ? "1" : "0");
      localStorage.setItem("ufficio_sound", "1");
    } else {
      // browser senza Notification API
      setNotifyEnabled(false);
      localStorage.setItem("ufficio_sound", "1");
    }
  }

  useEffect(() => {
    // carica preferenze salvate
    try {
      const n = localStorage.getItem("ufficio_notify");
      const s = localStorage.getItem("ufficio_sound");
      setNotifyEnabled(n === "1");
      setSoundEnabled(s === "1");
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

      // realtime: quando arriva un nuovo pickup, suono+notifica
      const ch = supabase
        .channel("realtime-ufficio-new-orders")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "pickups" }, (payload) => {
          const p = payload.new as Pickup;

          // evita doppie notifiche
          if (lastNotifiedIdRef.current === p.id) return;
          lastNotifiedIdRef.current = p.id;

          playDing();
          sendDesktopNotification(p);

          // aggiorna lista
          loadPickups();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "pickup_items" }, () => {
          loadPickups();
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pickups" }, () => {
          loadPickups();
        })
        .subscribe();

      return () => supabase.removeChannel(ch);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifyEnabled, soundEnabled]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function setStatus(pickupId: string, status: PickupStatus) {
    const { error } = await supabase.from("pickups").update({ status }).eq("id", pickupId);
    if (error) {
      console.error(error);
      alert("Errore aggiornamento stato");
      return;
    }
    loadPickups();
  }

  async function deletePickup(pickupId: string) {
    // Assumo che tu abbia già implementato delete funzionante:
    // 1) cancella righe items, 2) cancella pickup
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
  }

  if (loading) {
    return (
      <main style={ui.wrap}>
        <AppHeader title="Ufficio" subtitle="Caricamento…" />
      </main>
    );
  }

  const notifSupported = typeof window !== "undefined" && "Notification" in window;

  return (
    <main style={ui.wrap}>
      <AppHeader
        title="Ufficio"
        subtitle={`Ordini in arrivo. Nuovi: ${unreadCount}`}
        right={<button style={ui.btnSoft} onClick={logout}>Esci</button>}
      />

      <section style={ui.card}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Loggato come: <b style={{ color: "var(--text)" }}>{me.name}</b>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={ui.btnSoft} onClick={enableNotificationsAndSound}>
              Abilita notifiche & suono
            </button>

            <div style={{ color: "var(--muted)", fontSize: 12, alignSelf: "center" }}>
              {notifSupported ? (
                <>Notifiche: <b style={{ color: "var(--text)" }}>{notifyEnabled ? "ON" : "OFF"}</b> · Suono: <b style={{ color: "var(--text)" }}>{soundEnabled ? "ON" : "OFF"}</b></>
              ) : (
                <>Notifiche non supportate dal browser · Suono: <b style={{ color: "var(--text)" }}>{soundEnabled ? "ON" : "OFF"}</b></>
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
          {pickups.map((p) => (
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
          ))}

          {pickups.length === 0 && <div style={{ color: "var(--muted)" }}>Nessuna richiesta.</div>}
        </div>
      </section>
    </main>
  );
}
