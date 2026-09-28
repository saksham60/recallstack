import { ImageResponse } from "next/og";

export const alt = "ReasonAI Knowledge Feed — technical stories worth understanding";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 72, background: "#09090b", color: "#fafafa", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 38, fontWeight: 700 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 18, background: "#a78bfa", color: "#09090b", fontSize: 42 }}>R</div>
        ReasonAI
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ color: "#a78bfa", fontSize: 25, fontWeight: 700, letterSpacing: 5 }}>KNOWLEDGE FEED</div>
        <div style={{ fontSize: 74, fontWeight: 700, lineHeight: 1.12 }}>Ideas worth understanding.</div>
        <div style={{ fontSize: 37, color: "#a1a1aa" }}>One story at a time.</div>
      </div>
      <div style={{ display: "flex", width: "100%", height: 3, background: "#a78bfa" }} />
    </div>,
    size,
  );
}
