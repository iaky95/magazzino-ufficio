"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const r = useRouter();
  const [role, setRole] = useState<"magazzino" | "ufficio">("magazzino");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, pin, name }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j?.error ?? "Errore login");
      return;
    }

    r.push(role === "magazzino" ? "/magazzino" : "/ufficio");
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520, margin: "0 auto" }}>
      <h1>Login</h1>

      <label style={lab}>
        Ruolo
        <select value={role} onChange={(e) => setRole(e.target.value as any)} style={inp}>
          <option value="magazzino">Magazzino</option>
          <option value="ufficio">Ufficio</option>
        </select>
      </label>

      {role === "magazzino" && (
        <label style={lab}>
          Nome magazziniere
          <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="es. Marco" />
        </label>
      )}

      <label style={lab}>
        PIN
        <input value={pin} onChange={(e) => setPin(e.target.value)} style={inp} placeholder="****" />
      </label>

      {err && <div style={{ color: "crimson", marginTop: 10 }}>{err}</div>}

      <button onClick={submit} style={btn}>Entra</button>
      <p style={{ color: "#666", marginTop: 10 }}>Se non hai il PIN, chiedilo all’amministratore.</p>
    </main>
  );
}

const lab: React.CSSProperties = { display: "grid", gap: 6, marginTop: 12 };
const inp: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" };
const btn: React.CSSProperties = { marginTop: 14, padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer" };
