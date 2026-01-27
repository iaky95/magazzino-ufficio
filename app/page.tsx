import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Prelievi Magazzino</h1>
      <p>Scegli schermata:</p>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <Link href="/magazzino" style={btn}>Magazzino (Magazzinieri)</Link>
        <Link href="/ufficio" style={btn}>Ufficio</Link>
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  padding: "12px 14px",
  border: "1px solid #ddd",
  borderRadius: 10,
  textDecoration: "none",
};
