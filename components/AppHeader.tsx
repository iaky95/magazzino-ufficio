"use client";

import Image from "next/image";

export function AppHeader(props: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header style={hdr}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={logoWrap}>
          <Image
            src="/logo.png"
            alt="Logo"
            width={44}
            height={44}
            style={{ objectFit: "contain" }}
            onError={() => {
              // se non c'è logo.png, non bloccare la pagina
            }}
          />
        </div>

        <div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.2 }}>{props.title}</div>
          {props.subtitle && <div style={{ color: "var(--muted)", marginTop: 4 }}>{props.subtitle}</div>}
        </div>
      </div>

      {props.right ? <div>{props.right}</div> : null}
    </header>
  );
}

const hdr: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  padding: 16,
  borderRadius: 16,
  border: "1px solid var(--border)",
  background: "linear-gradient(180deg, var(--card), var(--blue-50))",
  boxShadow: "var(--shadow)",
};

const logoWrap: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 14,
  border: "1px solid var(--border)",
  background: "white",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
};
