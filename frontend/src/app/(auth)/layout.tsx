import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        @keyframes auth-blob-float {
          0%,  100% { transform: translate(0px,   0px)   scale(1);    }
          25%        { transform: translate(35px, -55px)  scale(1.07); }
          50%        { transform: translate(-20px, 40px)  scale(0.95); }
          75%        { transform: translate(50px,  20px)  scale(1.03); }
        }
        @keyframes auth-blob-float-r {
          0%,  100% { transform: translate(0px,   0px)   scale(1);    }
          25%        { transform: translate(-40px, 50px)  scale(1.06); }
          50%        { transform: translate(25px, -35px)  scale(0.94); }
          75%        { transform: translate(-50px,-20px)  scale(1.04); }
        }
        .auth-blob {
          position: absolute;
          border-radius: 9999px;
          filter: blur(72px);
          will-change: transform;
          pointer-events: none;
        }
        .auth-blob-1 { animation: auth-blob-float   24s ease-in-out infinite; }
        .auth-blob-2 { animation: auth-blob-float-r 30s ease-in-out infinite 3s; }
        .auth-blob-3 { animation: auth-blob-float   20s ease-in-out infinite 7s; }
        .auth-blob-4 { animation: auth-blob-float-r 34s ease-in-out infinite 1s; }

        .auth-bg {
          background: linear-gradient(145deg,#eef0ff 0%,#e8eaff 45%,#eff8ff 100%);
        }
        [data-theme="glass-dark"] .auth-bg,
        [data-theme="orbis-dark"] .auth-bg {
          background: linear-gradient(145deg,#0f0a2e 0%,#12082a 45%,#0a1628 100%);
        }
        .auth-blob-a {
          background: radial-gradient(circle, #818cf8 0%, #6366f1 35%, transparent 70%);
          opacity: 0.38;
        }
        [data-theme="glass-dark"] .auth-blob-a,
        [data-theme="orbis-dark"] .auth-blob-a {
          background: radial-gradient(circle, #6366f1 0%, #4338ca 35%, transparent 70%);
          opacity: 0.30;
        }
        .auth-blob-b {
          background: radial-gradient(circle, #5eead4 0%, #0d9488 40%, transparent 70%);
          opacity: 0.30;
        }
        [data-theme="glass-dark"] .auth-blob-b,
        [data-theme="orbis-dark"] .auth-blob-b {
          background: radial-gradient(circle, #0d9488 0%, #065f46 40%, transparent 70%);
          opacity: 0.25;
        }
        .auth-blob-c {
          background: radial-gradient(circle, #a78bfa 0%, #7c3aed 40%, transparent 70%);
          opacity: 0.28;
        }
        [data-theme="glass-dark"] .auth-blob-c,
        [data-theme="orbis-dark"] .auth-blob-c {
          background: radial-gradient(circle, #7c3aed 0%, #5b21b6 40%, transparent 70%);
          opacity: 0.22;
        }
        .auth-blob-d {
          background: radial-gradient(circle, #fbbf24 0%, #f59e0b 40%, transparent 70%);
          opacity: 0.18;
        }
        [data-theme="glass-dark"] .auth-blob-d,
        [data-theme="orbis-dark"] .auth-blob-d {
          background: radial-gradient(circle, #b45309 0%, #92400e 40%, transparent 70%);
          opacity: 0.15;
        }
      `}</style>

      <div className="auth-bg relative min-h-screen overflow-hidden">
        {/* ── Animated blobs ── */}
        <div
          className="auth-blob auth-blob-1 auth-blob-a"
          style={{ width: 560, height: 560, top: -120, right: -100 }}
        />
        <div
          className="auth-blob auth-blob-2 auth-blob-b"
          style={{ width: 440, height: 440, bottom: -80, left: -80 }}
        />
        <div
          className="auth-blob auth-blob-3 auth-blob-c"
          style={{ width: 300, height: 300, top: "42%", left: "58%" }}
        />
        <div
          className="auth-blob auth-blob-4 auth-blob-d"
          style={{ width: 220, height: 220, top: "18%", left: "8%" }}
        />

        {/* ── Navigation ── */}
        <nav className="relative z-10 flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="Simplify Projects" width={28} height={28} className="h-7 w-auto" />
            <span className="font-semibold text-lg tracking-tight text-base-content">
              Simplify <span className="text-primary font-bold">Projects</span>
            </span>
          </Link>
          <div className="flex items-center gap-5 text-sm text-base-content/60">
            <Link
              href="/"
              className="hover:opacity-100 transition-opacity"
              style={{ opacity: 0.7 }}
            >
              Home
            </Link>
            <Link
              href="/pricing"
              className="hidden sm:inline hover:opacity-100 transition-opacity"
              style={{ opacity: 0.7 }}
            >
              Pricing
            </Link>
            <Link
              href="/contact"
              className="hidden sm:inline hover:opacity-100 transition-opacity"
              style={{ opacity: 0.7 }}
            >
              Contact
            </Link>
          </div>
        </nav>

        {/* ── Page content ── */}
        <div className="relative z-10 flex min-h-[calc(100vh-68px)] items-center justify-center px-4 pb-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </>
  );
}
