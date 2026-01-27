import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Prelievi Magazzino</h1>
      <Link href="/login" style={{ padding: "12px 14px", border: "1px solid #ddd", borderRadius: 10, textDecoration: "none" }}>
        Vai al Login
      </Link>
    </main>
  );
}