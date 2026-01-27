import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ui } from "@/components/uiStyles";

export default function Home() {
  return (
    <main style={ui.wrap}>
      <AppHeader
        title="Prelievi Magazzino"
        subtitle="Gestione richieste tra Magazzino e Ufficio."
        right={<Link href="/login" style={{ ...ui.btnSoft, textDecoration: "none", display: "inline-block" }}>Login</Link>}
      />

      <section style={ui.card}>
        <h2 style={{ marginTop: 0 }}>Accesso</h2>
        <p style={{ marginTop: 6, color: "var(--muted)" }}>
          Entra con PIN per usare la schermata Magazzino o Ufficio.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <Link href="/login" style={{ ...ui.btn, textDecoration: "none", display: "inline-block" }}>
            Vai al Login
          </Link>
        </div>

        <div style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
          Suggerimento: salva un collegamento diretto sul desktop a <b>/magazzino</b> e <b>/ufficio</b> (ti rimanda al login se non sei autenticato).
        </div>
      </section>
    </main>
  );
}
