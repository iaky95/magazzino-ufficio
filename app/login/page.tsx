"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ui } from "@/components/uiStyles";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setErr("");
    setLoading(true);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const j = await res.json().catch(() => ({}));

    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "Credenziali non valide");
      setLoading(false);
      return;
    }

    // redirect automatico in base al ruolo
    router.push(j.role === "ufficio" ? "/ufficio" : "/magazzino");
  }

  return (
    <main style={ui.wrap}>
      <AppHeader title="Login" subtitle="Accedi con username e password." />

      <section style={ui.card}>
        <label style={ui.lab}>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={ui.inp}
            placeholder="es. mario"
            autoComplete="username"
          />
        </label>

        <label style={ui.lab}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={ui.inp}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </label>

        {err && <div style={{ color: "#b91c1c", marginTop: 10, fontWeight: 800 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button onClick={submit} style={{ ...ui.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? "Accesso…" : "Entra"}
          </button>
        </div>
      </section>
    </main>
  );
}
