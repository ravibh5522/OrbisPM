import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title =
    searchParams.get("title") ?? "Simplify Projects – AI-Powered Project Management";
  const subtitle = searchParams.get("subtitle") ?? "for Engineering Teams";

  return new ImageResponse(
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        background:
          "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        position: "relative",
        fontFamily: "sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "6px",
          background: "linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)",
        }}
      />

      {/* Background decorative circles */}
      <div
        style={{
          position: "absolute",
          top: "-100px",
          right: "-100px",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "rgba(99,102,241,0.08)",
          border: "1px solid rgba(99,102,241,0.15)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-150px",
          left: "-80px",
          width: "400px",
          height: "400px",
          borderRadius: "50%",
          background: "rgba(99,102,241,0.05)",
          border: "1px solid rgba(99,102,241,0.10)",
        }}
      />

      {/* Logo + name row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "18px",
          padding: "52px 64px 0",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "16px",
            background: "#6366f1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "32px",
            fontWeight: "bold",
            color: "#fff",
          }}
        >
          O
        </div>
        <span
          style={{
            fontSize: "32px",
            fontWeight: "700",
            color: "#ffffff",
            letterSpacing: "-0.5px",
          }}
        >
          Simplify Projects
        </span>
        <span
          style={{
            marginLeft: "12px",
            padding: "4px 14px",
            borderRadius: "20px",
            background: "rgba(99,102,241,0.25)",
            border: "1px solid rgba(99,102,241,0.5)",
            fontSize: "16px",
            color: "#a5b4fc",
          }}
        >
          simplifyai.id
        </span>
      </div>

      {/* Main title */}
      <div
        style={{
          padding: "40px 64px 0",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            fontSize: title.length > 50 ? "44px" : "54px",
            fontWeight: "800",
            color: "#ffffff",
            lineHeight: "1.15",
            letterSpacing: "-1px",
            maxWidth: "900px",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: "26px",
              color: "#a5b4fc",
              marginTop: "12px",
              fontWeight: "500",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {/* Feature pills */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          padding: "36px 64px 0",
        }}
      >
        {[
          "AI Sprint Planning",
          "Real-Time Collaboration",
          "Enterprise RBAC",
        ].map((pill) => (
          <div
            key={pill}
            style={{
              padding: "8px 20px",
              borderRadius: "24px",
              background: "rgba(99,102,241,0.18)",
              border: "1px solid rgba(99,102,241,0.45)",
              fontSize: "17px",
              color: "#c7d2fe",
              fontWeight: "500",
            }}
          >
            {pill}
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div
        style={{
          position: "absolute",
          bottom: "0",
          left: "0",
          right: "0",
          height: "80px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          padding: "0 64px",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "18px" }}>
          The #1 Jira Alternative • Free Plan Available • Ship Faster with AI
        </span>
        <span style={{ color: "#6366f1", fontSize: "18px", fontWeight: "600" }}>
          simplifyai.id →
        </span>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
