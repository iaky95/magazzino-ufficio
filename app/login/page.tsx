"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ui } from "@/components/uiStyles";

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<"magazzino" | "ufficio">("magazzino");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setErr("");
    setLoading(true);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, pin, name }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j?.error ?? "PIN non valido");
      setLoading(false);
      return;
    }

    router.push(role === "magazzino" ? "/magazzino" : "/ufficio");
  }

  return (
    <main style={ui.wrap}>
      <AppHeader title="Login" subtitle="Inserisci PIN per accedere." />

      <section style={ui.card}>
        <label style={ui.lab}>
          Ruolo
          <select value={role} onChange={(e) => setRole(e.target.value as any)} style={ui.inp}>
            <option value="magazzino">Magazzino</option>
            <option value="ufficio">Ufficio</option>
          </select>
        </label>

        {role === "magazzino" && (
          <label style={ui.lab}>
            Nome magazziniere
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={ui.inp}
              placeholder="es. Marco"
            />
          </label>
        )}

        <label style={ui.lab}>
          PIN
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            style={ui.inp}
            placeholder="****"
          />
        </label>

        {err && <div style={{ color: "#b91c1c", marginTop: 10, fontWeight: 700 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button onClick={submit} style={{ ...ui.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? "Accesso…" : "Entra"}
          </button>
        </div>

        <p style={{ color: "var(--muted)", marginTop: 12, fontSize: 13 }}>
          Se non hai il PIN, chiedilo all’amministratore.
        </p>
      </section>
    </main>
  );
        }
    