import { useEffect, useRef, useState } from "react";
import wall from "@/assets/loader-graffiti-wall.png";
import splatter from "@/assets/loader-paint-splatter.png";
import riserSfx from "@/assets/loader-riser.mp3";
import hitSfx from "@/assets/loader-reveal-hit.mp3";

/* ------------------------------------------------------------------ */
/*  SoundifiedLoader                                                   */
/*  loading  → progress + graffiti build                              */
/*  verify   → checkmark draws, rips into a music note, audio wave    */
/*             sweeps in and shoves the note out of frame             */
/*  out      → fade the overlay and call onDone()                     */
/* ------------------------------------------------------------------ */

type Phase = "loading" | "verify" | "out";

const STEPS = [
  "Booting audio engine",
  "Loading DSP modules",
  "Warming up the meters",
  "Mixing the colors",
  "Spraying the walls",
  "Soundcheck",
] as const;

/* timeline (ms) — all reveal animations key off these so audio + motion stay in sync */
const T = {
  loadFull: 3400,
  loadReduced: 700,
  hit: 480,        // reveal-hit sound when the checkmark lands
  rip: 1000,       // checkmark tears apart
  note: 1100,      // music note forms
  wave: 1500,      // audio wave sweeps in
  out: 2200,       // hold before fading
  outReduced: 250,
  fade: 720,
} as const;

const C = {
  green: "#3dffa0",
  greenDeep: "#22e07a",
  cyan: "#00d4ff",
  indigo: "#818cf8",
  purple: "#9333ea",
} as const;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* fire-and-forget Audio that never throws if the asset/autoplay is blocked */
function makeSound(src: string, volume: number) {
  const a = new Audio(src);
  a.volume = volume;
  return a;
}

export function SoundifiedLoader({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);

  const reduce = useRef(prefersReducedMotion());
  const riser = useRef<HTMLAudioElement | null>(null);
  const hit = useRef<HTMLAudioElement | null>(null);
  const done = useRef(false);

  /* ── audio: start the riser, retry on first interaction if autoplay blocked ── */
  useEffect(() => {
    riser.current = makeSound(riserSfx, 0.5);
    hit.current = makeSound(hitSfx, 0.7);

    let armed = false;
    const tryStart = () => {
      if (armed) return;
      armed = true;
      riser.current?.play().catch(() => {});
      detach();
    };
    const detach = () => {
      window.removeEventListener("pointerdown", tryStart);
      window.removeEventListener("keydown", tryStart);
    };

    riser.current
      .play()
      .then(() => { armed = true; })
      .catch(() => {
        window.addEventListener("pointerdown", tryStart);
        window.addEventListener("keydown", tryStart);
      });

    return () => {
      detach();
      riser.current?.pause();
      hit.current?.pause();
    };
  }, []);

  /* ── loading: animate progress + step label, then advance to verify ── */
  useEffect(() => {
    if (phase !== "loading") return;
    const total = reduce.current ? T.loadReduced : T.loadFull;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / total);
      const eased = 1 - Math.pow(1 - t, 2.2); // ease-out, slows near the top
      setProgress(Math.round(eased * 100));
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

  /* ── verify: play the reveal hit, then hold for the rip/note/wave before fading ── */
  useEffect(() => {
    if (phase !== "verify") return;
    const hitAt = reduce.current ? 50 : T.hit;
    const outAt = reduce.current ? T.outReduced : T.out;
    const a = setTimeout(() => hit.current?.play().catch(() => {}), hitAt);
    const b = setTimeout(() => setPhase("out"), outAt);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [phase]);

  /* ── out: fade, then signal completion exactly once ── */
  useEffect(() => {
    if (phase !== "out") return;
    const t = setTimeout(() => {
      if (!done.current) { done.current = true; onDone(); }
    }, reduce.current ? 200 : T.fade);
    return () => clearTimeout(t);
  }, [phase, onDone]);

  const still = reduce.current;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflow: "hidden",
        background: "#040407",
        animation: phase === "out" ? `sl-fade-out ${T.fade}ms ease forwards` : undefined,
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* graffiti wall */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${wall})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.55,
          animation: still ? undefined : "sl-wall-in 1.2s ease forwards",
        }}
      />
      {/* neon vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 42%, rgba(10,12,24,.25) 0%, rgba(4,4,8,.78) 60%, rgba(2,2,4,.96) 100%)",
        }}
      />

      {/* center stack */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Wordmark still={still} />

        <div
          style={{
            fontFamily: "'Permanent Marker', cursive",
            color: "rgba(180,200,255,.7)",
            fontSize: "clamp(12px, 2.4vw, 18px)",
            letterSpacing: "0.18em",
            marginTop: 10,
            textTransform: "uppercase",
          }}
        >
          One Studio · Every Tool
        </div>

        <div style={{ width: "min(420px, 80vw)", marginTop: 44 }}>
          {phase === "loading" ? (
            <ProgressBar progress={progress} step={STEPS[stepIdx]} />
          ) : (
            <RevealBadge still={still} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Wordmark({ still }: { still: boolean }) {
  return (
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
          pointerEvents: "none",
          animation: still ? undefined : "sl-splat-in 1s cubic-bezier(.2,.8,.2,1) forwards",
        }}
      />
      <h1
        style={{
          position: "relative",
          margin: 0,
          fontFamily: "'Bangers', system-ui, sans-serif",
          fontSize: "clamp(48px, 11vw, 132px)",
          lineHeight: 0.9,
          letterSpacing: "0.04em",
          transform: "skewX(-4deg)",
          background: `linear-gradient(180deg, #d9f6ff 0%, ${C.cyan} 32%, ${C.indigo} 64%, ${C.purple} 100%)`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          filter:
            "drop-shadow(0 0 6px rgba(0,212,255,.85)) drop-shadow(0 0 22px rgba(129,140,248,.6)) drop-shadow(0 0 40px rgba(147,51,234,.5))",
          animation: still
            ? undefined
            : "sl-word-in .9s cubic-bezier(.2,.8,.2,1) both, sl-flicker 3.4s ease-in-out 1s infinite",
          userSelect: "none",
        }}
      >
        SOUNDIFIED
      </h1>
    </div>
  );
}

function ProgressBar({ progress, step }: { progress: number; step: string }) {
  const mono = { fontFamily: "'Space Mono', monospace" } as const;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{ ...mono, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(180,200,255,.75)" }}>
          {step}
        </span>
        <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: C.cyan }}>{progress}%</span>
      </div>
      <div style={{ position: "relative", height: 6, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${progress}%`,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${C.cyan}, ${C.indigo} 55%, ${C.purple})`,
            boxShadow: "0 0 12px rgba(0,212,255,.7)",
            transition: "width .2s linear",
          }}
        />
      </div>
    </>
  );
}

/* checkmark → rip → music note → audio-wave shove → "Ready" */
function RevealBadge({ still }: { still: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div
        style={{
          position: "relative", // overflow-visible so the note can fly out of frame
          width: 76,
          height: 76,
          animation: still ? undefined : "sl-badge-pop .5s cubic-bezier(.2,.8,.2,1) both",
        }}
      >
        {!still && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 999,
              border: `2px solid ${C.greenDeep}`,
              animation: "sl-ring .8s ease-out .25s forwards",
            }}
          />
        )}

        {/* badge disc — clips the checkmark + light sweep */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 999,
            background: "radial-gradient(circle at 50% 40%, rgba(34,224,122,.22), rgba(8,20,14,.6))",
            border: "2px solid rgba(34,224,122,.55)",
            boxShadow: "0 0 24px rgba(34,224,122,.45), inset 0 0 16px rgba(34,224,122,.25)",
            overflow: "hidden",
          }}
        >
          <svg viewBox="0 0 76 76" width="76" height="76" style={{ position: "absolute", inset: 0 }}>
            <path
              d="M22 39 L33 50 L55 27"
              fill="none"
              stroke={C.green}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                filter: "drop-shadow(0 0 6px rgba(61,255,160,.9))",
                strokeDasharray: 60,
                strokeDashoffset: still ? 0 : 60,
                animation: still
                  ? undefined
                  : `sl-check .5s ease .3s forwards, sl-check-rip .4s ease ${T.rip}ms forwards`,
              }}
            />
            {!still && (
              <path
                d="M40 16 L46 30 L36 38 L48 48 L38 60"
                fill="none"
                stroke="#eafff1"
                strokeWidth="2.5"
                strokeLinecap="round"
                style={{ opacity: 0, transformOrigin: "center", animation: `sl-rip-flash .5s ease ${T.rip}ms forwards` }}
              />
            )}
          </svg>

          {!still && (
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

        {/* music note: outer wrapper = the shove, inner svg = the form */}
        {!still && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              animation: `sl-note-push .8s cubic-bezier(.5,0,.7,1) ${T.wave + 50}ms forwards`,
            }}
          >
            <svg
              viewBox="0 0 40 40"
              width="40"
              height="40"
              style={{
                opacity: 0,
                filter: "drop-shadow(0 0 8px rgba(61,255,160,.9))",
                animation: `sl-note-form .5s cubic-bezier(.2,1.4,.4,1) ${T.note}ms forwards`,
              }}
            >
              <g fill={C.green}>
                <rect x="22" y="6" width="3" height="20" rx="1.5" />
                <path d="M25 6 C25 6 35 7.5 35 14 C35 16.5 31.5 17.5 30 15.5 C33 15.5 33 12 25 11 Z" />
                <ellipse cx="17" cy="27" rx="6.5" ry="4.6" transform="rotate(-18 17 27)" />
              </g>
            </svg>
          </div>
        )}

        {/* audio wave that sweeps in from the left and pushes the note away */}
        {!still && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: -46,
              width: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              opacity: 0,
              animation: `sl-wave-push .8s ease-out ${T.wave}ms forwards`,
            }}
          >
            {[10, 22, 34, 22, 10].map((h, i) => (
              <span
                key={i}
                style={{
                  display: "block",
                  width: 3,
                  height: h,
                  borderRadius: 3,
                  background: `linear-gradient(#7dffc0, ${C.greenDeep})`,
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
          fontSize: 12,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: C.green,
        }}
      >
        Ready
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const KEYFRAMES = `
@keyframes sl-fade-out { to { opacity: 0; transform: scale(1.04); pointer-events: none; } }
@keyframes sl-wall-in { from { opacity: 0; transform: scale(1.12); } to { opacity: .55; transform: scale(1.04); } }
@keyframes sl-splat-in { 0% { opacity: 0; transform: scale(.6) rotate(-6deg); } 60% { opacity: .9; } 100% { opacity: .8; transform: scale(1) rotate(0deg); } }
@keyframes sl-word-in { 0% { opacity: 0; transform: translateY(26px) scale(.92) skewX(-6deg); filter: blur(8px); } 100% { opacity: 1; transform: translateY(0) scale(1) skewX(-4deg); filter: blur(0); } }
@keyframes sl-flicker { 0%,100% { opacity: 1; } 92% { opacity: 1; } 94% { opacity: .55; } 96% { opacity: 1; } 97% { opacity: .7; } 98% { opacity: 1; } }
@keyframes sl-sweep { 0% { left: -15%; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { left: 115%; opacity: 0; } }
@keyframes sl-check { to { stroke-dashoffset: 0; } }
@keyframes sl-badge-pop { 0% { transform: scale(.7); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes sl-ring { 0% { transform: scale(.8); opacity: .7; } 100% { transform: scale(1.7); opacity: 0; } }

/* reveal: checkmark rips into a note, audio wave shoves it out */
@keyframes sl-check-rip { 0% { opacity: 1; transform: translateX(0); } 100% { opacity: 0; transform: translateX(-7px) scale(1.12); } }
@keyframes sl-rip-flash { 0% { opacity: 0; transform: scaleY(.3); } 45% { opacity: 1; transform: scaleY(1); } 100% { opacity: 0; transform: scaleY(1.4); } }
@keyframes sl-note-form { 0% { opacity: 0; transform: scale(.15) rotate(-30deg); } 70% { opacity: 1; transform: scale(1.15) rotate(0); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
@keyframes sl-note-push { 0% { transform: translateX(0) rotate(0); opacity: 1; } 55% { transform: translateX(80px) rotate(14deg); opacity: 1; } 100% { transform: translateX(190px) rotate(24deg); opacity: 0; } }
@keyframes sl-wave-push { 0% { transform: translateX(-80px) scaleX(.5); opacity: 0; } 30% { opacity: 1; } 60% { transform: translateX(4px) scaleX(1); opacity: 1; } 100% { transform: translateX(120px) scaleX(1); opacity: 0; } }
@keyframes sl-eq { 0%,100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
`;
