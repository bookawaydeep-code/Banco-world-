import { useEffect, useRef, useState } from "react";
import wall from "@/assets/loader-graffiti-wall.png";
import splatter from "@/assets/loader-paint-splatter.png";
import riserSfx from "@/assets/loader-riser.mp3";
import hitSfx from "@/assets/loader-reveal-hit.mp3";

type Phase = "loading" | "verify" | "out";

const STEPS = [
  "Booting audio engine",
  "Loading DSP modules",
  "Warming up the meters",
  "Mixing the colors",
  "Spraying the walls",
  "Soundcheck",
];

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function SoundifiedLoader({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [stepIdx, setStepIdx] = useState(0);
  const reduce = useRef(prefersReducedMotion());
  const riserRef = useRef<HTMLAudioElement | null>(null);
  const hitRef = useRef<HTMLAudioElement | null>(null);
  const doneCalled = useRef(false);

  // ── Audio (best-effort; autoplay may be blocked) ──────────────────────────
  useEffect(() => {
    const riser = new Audio(riserSfx);
    riser.volume = 0.5;
    const hit = new Audio(hitSfx);
    hit.volume = 0.7;
    riserRef.current = riser;
    hitRef.current = hit;

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      riser.play().catch(() => {});
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    riser.play().then(() => { started = true; }).catch(() => {
      window.addEventListener("pointerdown", start);
      window.addEventListener("keydown", start);
    });

    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      riser.pause();
      hit.pause();
    };
  }, []);

  // ── Progress simulation ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "loading") return;
    const total = reduce.current ? 700 : 3400;
    const startedAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / total);
      // ease-out so it slows near the top
      const eased = 1 - Math.pow(1 - t, 2.2);
      const pct = Math.round(eased * 100);
      setProgress(pct);
      setStepIdx(Math.min(STEPS.length - 1, Math.floor(eased * STEPS.length)));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setProgress(100);
        setPhase("verify");
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // ── Verify → reveal hit → fade out → done ─────────────────────────────────
  useEffect(() => {
    if (phase !== "verify") return;
    const hitDelay = reduce.current ? 50 : 480;
    // hold long enough for the checkmark to rip into the note and the
    // audio wave to shove it out of frame before we fade.
    const outDelay = reduce.current ? 250 : 2200;
    const t1 = setTimeout(() => {
      hitRef.current?.play().catch(() => {});
    }, hitDelay);
    const t2 = setTimeout(() => setPhase("out"), outDelay);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [phase]);

  useEffect(() => {
    if (phase !== "out") return;
    const t = setTimeout(() => {
      if (!doneCalled.current) { doneCalled.current = true; onDone(); }
    }, reduce.current ? 200 : 720);
    return () => clearTimeout(t);
  }, [phase, onDone]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflow: "hidden",
        background: "#040407",
        animation: phase === "out" ? "sl-fade-out .7s ease forwards" : undefined,
      }}
    >
      <style>{`
        @keyframes sl-fade-out { to { opacity: 0; transform: scale(1.04); pointer-events: none; } }
        @keyframes sl-wall-in { from { opacity: 0; transform: scale(1.12); } to { opacity: .55; transform: scale(1.04); } }
        @keyframes sl-splat-in { 0% { opacity: 0; transform: scale(.6) rotate(-6deg); } 60% { opacity: .9; } 100% { opacity: .8; transform: scale(1) rotate(0deg); } }
        @keyframes sl-word-in { 0% { opacity: 0; transform: translateY(26px) scale(.92) skewX(-6deg); filter: blur(8px); } 100% { opacity: 1; transform: translateY(0) scale(1) skewX(-4deg); filter: blur(0); } }
        @keyframes sl-flicker { 0%,100% { opacity: 1; } 92% { opacity: 1; } 94% { opacity: .55; } 96% { opacity: 1; } 97% { opacity: .7; } 98% { opacity: 1; } }
        @keyframes sl-drip { from { height: 0; opacity: .9; } to { height: var(--dh); opacity: 0; } }
        @keyframes sl-sweep { 0% { left: -15%; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { left: 115%; opacity: 0; } }
        @keyframes sl-check { to { stroke-dashoffset: 0; } }
        @keyframes sl-badge-pop { 0% { transform: scale(.7); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes sl-ring { 0% { transform: scale(.8); opacity: .7; } 100% { transform: scale(1.7); opacity: 0; } }

        /* checkmark gets torn away as the note forms */
        @keyframes sl-check-rip { 0% { opacity: 1; transform: translateX(0); } 100% { opacity: 0; transform: translateX(-7px) scale(1.12); } }
        /* jagged tear flashes at the moment of the rip */
        @keyframes sl-rip-flash { 0% { opacity: 0; transform: scaleY(.3); } 45% { opacity: 1; transform: scaleY(1); } 100% { opacity: 0; transform: scaleY(1.4); } }
        /* music note grows out of the tear */
        @keyframes sl-note-form { 0% { opacity: 0; transform: scale(.15) rotate(-30deg); } 70% { opacity: 1; transform: scale(1.15) rotate(0); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
        /* audio wave shoves the note off to the right */
        @keyframes sl-note-push { 0% { transform: translateX(0) rotate(0); opacity: 1; } 55% { transform: translateX(80px) rotate(14deg); opacity: 1; } 100% { transform: translateX(190px) rotate(24deg); opacity: 0; } }
        /* the wave itself sweeps in from the left, through, and out */
        @keyframes sl-wave-push { 0% { transform: translateX(-80px) scaleX(.5); opacity: 0; } 30% { opacity: 1; } 60% { transform: translateX(4px) scaleX(1); opacity: 1; } 100% { transform: translateX(120px) scaleX(1); opacity: 0; } }
        /* equalizer bounce */
        @keyframes sl-eq { 0%,100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }

        .sl-bar-fill { transition: width .2s linear; }
      `}</style>

      {/* graffiti wall background */}
      <div
        style={{
          position: "absolute", inset: 0,
          backgroundImage: `url(${wall})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.55,
          animation: reduce.current ? undefined : "sl-wall-in 1.2s ease forwards",
        }}
      />
      {/* darkening + neon vignette */}
      <div
        style={{
          position: "absolute", inset: 0,
          background:
            "radial-gradient(ellipse at 50% 42%, rgba(10,12,24,.25) 0%, rgba(4,4,8,.78) 60%, rgba(2,2,4,.96) 100%)",
        }}
      />

      {/* center stack */}
      <div
        style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "24px",
        }}
      >
        {/* splatter behind wordmark */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img
            src={splatter}
            alt=""
            style={{
              position: "absolute",
              width: "min(680px, 92vw)",
              maxWidth: "92vw",
              filter: "saturate(1.2)",
              mixBlendMode: "screen",
              opacity: 0.8,
              animation: reduce.current ? undefined : "sl-splat-in 1s cubic-bezier(.2,.8,.2,1) forwards",
              pointerEvents: "none",
            }}
          />
          {/* SOUNDIFIED wordmark */}
          <h1
            style={{
              position: "relative",
              margin: 0,
              fontFamily: "'Bangers', system-ui, sans-serif",
              fontSize: "clamp(48px, 11vw, 132px)",
              lineHeight: 0.9,
              letterSpacing: "0.04em",
              transform: "skewX(-4deg)",
              background: "linear-gradient(180deg, #d9f6ff 0%, #00d4ff 32%, #818cf8 64%, #9333ea 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              filter:
                "drop-shadow(0 0 6px rgba(0,212,255,.85)) drop-shadow(0 0 22px rgba(129,140,248,.6)) drop-shadow(0 0 40px rgba(147,51,234,.5))",
              animation: reduce.current
                ? undefined
                : "sl-word-in .9s cubic-bezier(.2,.8,.2,1) both, sl-flicker 3.4s ease-in-out 1s infinite",
              userSelect: "none",
            }}
          >
            SOUNDIFIED
          </h1>
        </div>

        {/* tagline */}
        <div
          style={{
            fontFamily: "'Permanent Marker', cursive",
            color: "rgba(180,200,255,.7)",
            fontSize: "clamp(12px, 2.4vw, 18px)",
            letterSpacing: "0.18em",
            marginTop: "10px",
            textTransform: "uppercase",
          }}
        >
          One Studio · Every Tool
        </div>

        {/* progress / status zone */}
        <div style={{ width: "min(420px, 80vw)", marginTop: "44px" }}>
          {phase === "loading" ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
                <span
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "12px",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(180,200,255,.75)",
                  }}
                >
                  {STEPS[stepIdx]}
                </span>
                <span
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#00d4ff",
                  }}
                >
                  {progress}%
                </span>
              </div>
              <div
                style={{
                  position: "relative",
                  height: "6px",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  className="sl-bar-fill"
                  style={{
                    position: "absolute", inset: 0,
                    width: `${progress}%`,
                    borderRadius: "999px",
                    background: "linear-gradient(90deg, #00d4ff, #818cf8 55%, #9333ea)",
                    boxShadow: "0 0 12px rgba(0,212,255,.7)",
                  }}
                />
              </div>
            </>
          ) : (
            <CheckmarkBadge reduce={reduce.current} />
          )}
        </div>
      </div>
    </div>
  );
}

function CheckmarkBadge({ reduce }: { reduce: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
      {/* outer container is overflow-visible so the note can fly out of frame */}
      <div
        style={{
          position: "relative",
          width: "76px",
          height: "76px",
          animation: reduce ? undefined : "sl-badge-pop .5s cubic-bezier(.2,.8,.2,1) both",
        }}
      >
        {/* expanding ring */}
        {!reduce && (
          <div
            style={{
              position: "absolute", inset: 0, borderRadius: "999px",
              border: "2px solid #22e07a",
              animation: "sl-ring .8s ease-out .25s forwards",
            }}
          />
        )}
        {/* badge (clips the checkmark + sweep) */}
        <div
          style={{
            position: "absolute", inset: 0, borderRadius: "999px",
            background: "radial-gradient(circle at 50% 40%, rgba(34,224,122,.22), rgba(8,20,14,.6))",
            border: "2px solid rgba(34,224,122,.55)",
            boxShadow: "0 0 24px rgba(34,224,122,.45), inset 0 0 16px rgba(34,224,122,.25)",
            overflow: "hidden",
          }}
        >
          <svg viewBox="0 0 76 76" width="76" height="76" style={{ position: "absolute", inset: 0 }}>
            {/* checkmark draws in, then gets ripped away */}
            <path
              d="M22 39 L33 50 L55 27"
              fill="none"
              stroke="#3dffa0"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                filter: "drop-shadow(0 0 6px rgba(61,255,160,.9))",
                strokeDasharray: 60,
                strokeDashoffset: reduce ? 0 : 60,
                animation: reduce
                  ? undefined
                  : "sl-check .5s ease .3s forwards, sl-check-rip .4s ease 1.0s forwards",
              }}
            />
            {/* jagged tear that flashes as the checkmark rips into the note */}
            {!reduce && (
              <path
                d="M40 16 L46 30 L36 38 L48 48 L38 60"
                fill="none"
                stroke="#eafff1"
                strokeWidth="2.5"
                strokeLinecap="round"
                style={{
                  opacity: 0,
                  transformOrigin: "center",
                  animation: "sl-rip-flash .5s ease 1.0s forwards",
                }}
              />
            )}
          </svg>

          {/* white sweep line */}
          {!reduce && (
            <div
              style={{
                position: "absolute",
                top: "-10%",
                left: "-15%",
                width: "10%",
                height: "120%",
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,.95), transparent)",
                filter: "blur(1px)",
                transform: "skewX(-18deg)",
                animation: "sl-sweep .7s cubic-bezier(.4,0,.2,1) forwards",
              }}
            />
          )}
        </div>

        {/* music note that forms from the tear, then gets shoved out of frame.
            outer wrapper = the "push", inner svg = the "form" (two transforms). */}
        {!reduce && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              animation: "sl-note-push .8s cubic-bezier(.5,0,.7,1) 1.55s forwards",
            }}
          >
            <svg
              viewBox="0 0 40 40"
              width="40"
              height="40"
              style={{
                opacity: 0,
                filter: "drop-shadow(0 0 8px rgba(61,255,160,.9))",
                animation: "sl-note-form .5s cubic-bezier(.2,1.4,.4,1) 1.1s forwards",
              }}
            >
              <g fill="#3dffa0">
                <rect x="22" y="6" width="3" height="20" rx="1.5" />
                <path d="M25 6 C25 6 35 7.5 35 14 C35 16.5 31.5 17.5 30 15.5 C33 15.5 33 12 25 11 Z" />
                <ellipse cx="17" cy="27" rx="6.5" ry="4.6" transform="rotate(-18 17 27)" />
              </g>
            </svg>
          </div>
        )}

        {/* audio wave that sweeps in and pushes the note away */}
        {!reduce && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: "-46px",
              width: "44px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "3px",
              opacity: 0,
              animation: "sl-wave-push .8s ease-out 1.5s forwards",
            }}
          >
            {[10, 22, 34, 22, 10].map((h, i) => (
              <span
                key={i}
                style={{
                  display: "block",
                  width: "3px",
                  height: `${h}px`,
                  borderRadius: "3px",
                  background: "linear-gradient(#7dffc0, #22e07a)",
                  boxShadow: "0 0 8px rgba(61,255,160,.8)",
                  animation: `sl-eq .5s ease-in-out ${(i % 3) * 0.08}s infinite`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <span
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: "12px",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "#3dffa0",
        }}
      >
        Ready
      </span>
    </div>
  );
}
