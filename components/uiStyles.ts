import type { CSSProperties } from "react";

export const ui = {
  wrap: {
    padding: 24,
    fontFamily: "system-ui",
    maxWidth: 1150,
    margin: "0 auto",
  } as CSSProperties,

  card: {
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    background: "var(--card)",
    boxShadow: "var(--shadow)",
  } as CSSProperties,

  lab: {
    display: "grid",
    gap: 6,
    fontSize: 14,
  } as CSSProperties,

  inp: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    fontSize: 14,
    outline: "none",
    background: "white",
  } as CSSProperties,

  btn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "linear-gradient(180deg, var(--blue-600), var(--blue-700))",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
  } as CSSProperties,

  btnSoft: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "linear-gradient(180deg, var(--card), var(--blue-50))",
    color: "var(--blue-700)",
    cursor: "pointer",
    fontWeight: 800,
  } as CSSProperties,

  // 👇 QUESTO MANCAVA
  btnSmall: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "linear-gradient(180deg, var(--card), var(--blue-50))",
    color: "var(--blue-700)",
    cursor: "pointer",
    fontWeight: 800,
  } as CSSProperties,

  btnDanger: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "linear-gradient(180deg, #fff, #fff5f5)",
    color: "#b91c1c",
    cursor: "pointer",
    fontWeight: 900,
  } as CSSProperties,

  badge: {
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    fontSize: 12,
    background: "var(--blue-50)",
    color: "var(--blue-700)",
    fontWeight: 900,
  } as CSSProperties,
};
