"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [busyId, setBusyId] = useState<string>(""); // per disabilitare bottoni su riga

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return materials;
    return materials.filter((m) => {
      const hay = [m.name, m.code ?? "", m.category ?? "", m.brand ?? "", m.unit ?? ""].join(" ").toLowerCase();
      return hay.includes(s);
    });
  }, [materials, q]);

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

    // update UI immediato + refresh “vera”
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, active: next } : m)));
    await loadMaterials();
    setBusyId("");
  }

  // ✅ DELETE vero via API server (service role), così non “ricompare”
  async function deleteMaterial(id: string) {
    const ok = window.confirm(
      "Sei sicuro di voler eliminare questo materiale?\n\nL'operazione è irreversibile."
    );
  
    if (!ok) return;
  
    setBusyId(id);
    setMsg(null);
  
    const r = await fetch("/api/materials/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  
    const j = await r.json().catch(() => ({}));
  
    if (!r.ok) {
      setMsg({ type: "err", text: `Errore eliminazione: ${j.error || "sconosciuto"}` });
      setBusyId("");
      return;
    }
  
    setMsg({ type: "ok", text: "Materiale eliminato." });
    await loadMaterials();
    setBusyId("");
  }
  

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const ok = await fetchMeOrRedirect();
      if (!ok) return;

      await loadMaterials();
      setLoading(false);

      const ch = supabase
        .channel("realtime-materials-ufficio")
        .on("postgres_changes", { event: "*", schema: "public", table: "materials" }, () => loadMaterials())
        .subscribe();

      return () => supabase.removeChannel(ch);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <main style={ui.wrap}>
        <AppHeader title="Materiali" subtitle="Caricamento…" />
      </main>
    );
  }

  return (
    <main style={ui.wrap}>
      <AppHeader
        title="Materiali"
        subtitle="Ufficio: inserisci e gestisci il catalogo"
        right={
          <div style={{ display: "flex", gap: 10 }}>
            <a
              href="/ufficio"
              style={{ ...ui.btnSoft, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              ← Ufficio
            </a>
            <button style={ui.btnSoft} onClick={logout}>
              Esci
            </button>
          </div>
        }
      />

      <section style={ui.card}>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
          Loggato come: <b style={{ color: "var(--text)" }}>{me.name}</b>
        </div>

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
                    disabled={busyId === m.id}
                  >
                    {m.active ? "Disattiva" : "Attiva"}
                  </button>

                  <button
                    style={ui.btnDanger}
                    onClick={() => deleteMaterial(m.id)}
                    disabled={busyId === m.id}
                  >
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
