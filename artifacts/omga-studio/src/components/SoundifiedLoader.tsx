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
/*                                                                     */
/*  FX layers (additive): electric storm bg, paw-print cursor,        */
/*  howling mini wolf on every "click-in", spark burst, embers,       */
/*  neon scanlines.                                                    */
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

/* synthesized wolf howl — no asset needed, best-effort (autoplay may block) */
let _howlCtx: AudioContext | null = null;
function howl(strength = 1) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    _howlCtx = _howlCtx || new AC();
    const ctx = _howlCtx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const band = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300 + 40 * strength, now);
    osc.frequency.linearRampToValueAtTime(720 + 60 * strength, now + 0.18);
    osc.frequency.linearRampToValueAtTime(540, now + 0.62);

    lfo.frequency.value = 11;          // vibrato = the "howl" warble
    lfoGain.gain.value = 16;
    lfo.connect(lfoGain).connect(osc.frequency);

    band.type = "bandpass";
    band.frequency.value = 820;
    band.Q.value = 6;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.11 * strength, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

    osc.connect(band).connect(gain).connect(ctx.destination);
    osc.start(now); lfo.start(now);
    osc.stop(now + 0.72); lfo.stop(now + 0.72);
  } catch {
    /* ignore */
  }
}

export function SoundifiedLoader({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [howlTick, setHowlTick] = useState(0); // bumped every time something "clicks in"

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
      _howlCtx?.resume().catch(() => {});
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

  /* ── wolf howls every time a step clicks in ── */
  useEffect(() => {
    if (phase !== "loading") return;
    setHowlTick((h) => h + 1);
    if (!reduce.current) howl(0.85);
  }, [stepIdx, phase]);

  /* ── verify: play the reveal hit, big howl, then hold before fading ── */
  useEffect(() => {
    if (phase !== "verify") return;
    const hitAt = reduce.current ? 50 : T.hit;
    const outAt = reduce.current ? T.outReduced : T.out;
    const a = setTimeout(() => {
      hit.current?.play().catch(() => {});
      setHowlTick((h) => h + 1);
      if (!reduce.current) howl(1.3);
    }, hitAt);
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
        cursor: still ? "auto" : "none",
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

      {/* ⚡ electric storm behind everything */}
      {!still && <ElectricCanvas />}

      {/* neon vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 42%, rgba(10,12,24,.25) 0%, rgba(4,4,8,.78) 60%, rgba(2,2,4,.96) 100%)",
        }}
      />

      {/* floating embers */}
      {!still && <Embers />}

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

        {/* 🐺 howling mini wolf — howls on every click-in */}
        {!still && <WolfHowl trigger={howlTick} />}
      </div>

      {/* neon scanlines */}
      {!still && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            mixBlendMode: "overlay",
            opacity: 0.18,
            backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,.25) 0 1px, transparent 1px 3px)",
            animation: "sl-scan 8s linear infinite",
          }}
        />
      )}

      {/* 🐾 live paw-print cursor (topmost) */}
      {!still && <PawCursor />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Wordmark / Progress / Reveal                                       */
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

/* checkmark → rip → music note → audio-wave shove → "Ready" (+ spark burst) */
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
        {!still && <SparkBurst />}

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
/*  FX LAYERS                                                          */
/* ------------------------------------------------------------------ */

/* ⚡ realistic-ish lightning storm on a canvas */
function ElectricCanvas() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0;
    const resize = () => {
      w = cv.width = Math.floor(window.innerWidth * dpr);
      h = cv.height = Math.floor(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    type Bolt = { pts: number[][]; life: number; hue: number; width: number };
    const bolts: Bolt[] = [];

    const jagged = (x1: number, y1: number, x2: number, y2: number, n: number) => {
      const pts: number[][] = [];
      const off = 38 * dpr;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const jx = i === 0 || i === n ? 0 : (Math.random() - 0.5) * off;
        const jy = i === 0 || i === n ? 0 : (Math.random() - 0.5) * off;
        pts.push([x1 + (x2 - x1) * t + jx, y1 + (y2 - y1) * t + jy]);
      }
      return pts;
    };

    const spawn = () => {
      const x1 = Math.random() * w;
      const y1 = Math.random() * h * 0.25;
      const x2 = x1 + (Math.random() - 0.5) * w * 0.6;
      const y2 = y1 + h * (0.45 + Math.random() * 0.4);
      const hue = 170 + Math.random() * 130; // cyan→purple
      bolts.push({ pts: jagged(x1, y1, x2, y2, 12), life: 1, hue, width: (1.2 + Math.random() * 1.6) * dpr });
      // occasional branch
      if (Math.random() < 0.7) {
        const b = bolts[bolts.length - 1].pts;
        const k = 3 + Math.floor(Math.random() * (b.length - 5));
        const [bx, by] = b[k];
        bolts.push({
          pts: jagged(bx, by, bx + (Math.random() - 0.5) * w * 0.3, by + h * 0.25 * Math.random(), 7),
          life: 0.8, hue, width: dpr,
        });
      }
    };

    let raf = 0;
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (Math.random() < 0.05) spawn();

      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.life -= 0.07;
        if (b.life <= 0) { bolts.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.moveTo(b.pts[0][0], b.pts[0][1]);
        for (let j = 1; j < b.pts.length; j++) ctx.lineTo(b.pts[j][0], b.pts[j][1]);
        const a = Math.max(0, b.life);
        ctx.shadowBlur = 16 * dpr;
        ctx.shadowColor = `hsla(${b.hue},100%,70%,1)`;
        ctx.strokeStyle = `hsla(${b.hue},100%,80%,${a})`;
        ctx.lineWidth = b.width;
        ctx.stroke();
        // hot white core
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.7})`;
        ctx.lineWidth = b.width * 0.4;
        ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.55, pointerEvents: "none", mixBlendMode: "screen" }}
    />
  );
}

/* floating embers drifting up */
function Embers() {
  const seeds = useRef(
    Array.from({ length: 26 }, () => ({
      left: Math.random() * 100,
      size: 2 + Math.random() * 4,
      dur: 6 + Math.random() * 8,
      delay: -Math.random() * 12,
      drift: (Math.random() - 0.5) * 60,
      hue: Math.random() < 0.5 ? C.cyan : C.green,
    })),
  );
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {seeds.current.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            bottom: -10,
            left: `${s.left}%`,
            width: s.size,
            height: s.size,
            borderRadius: 999,
            background: s.hue,
            boxShadow: `0 0 8px ${s.hue}`,
            ["--drift" as string]: `${s.drift}px`,
            animation: `sl-ember ${s.dur}s linear ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* spark burst that erupts from the badge on reveal */
function SparkBurst() {
  const sparks = useRef(
    Array.from({ length: 16 }, (_, i) => {
      const ang = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 40 + Math.random() * 38;
      return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, d: Math.random() * 0.12 };
    }),
  );
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {sparks.current.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 4,
            height: 4,
            marginLeft: -2,
            marginTop: -2,
            borderRadius: 999,
            background: C.green,
            boxShadow: `0 0 8px ${C.green}`,
            ["--sx" as string]: `${s.x}px`,
            ["--sy" as string]: `${s.y}px`,
            animation: `sl-spark .7s ease-out ${0.25 + s.d}s forwards`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

/* 🐺 mini wolf that pops, tilts up and howls (sound rings) on each trigger change */
function WolfHowl({ trigger }: { trigger: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!trigger) return;
    setOn(false);
    const r = requestAnimationFrame(() => setOn(true));
    const t = setTimeout(() => setOn(false), 950);
    return () => { cancelAnimationFrame(r); clearTimeout(t); };
  }, [trigger]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        width: 64,
        height: 64,
        pointerEvents: "none",
      }}
    >
      {/* howl sound rings */}
      {on && [0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: 6,
            left: 40,
            width: 14,
            height: 14,
            borderRadius: 999,
            border: `2px solid ${C.green}`,
            opacity: 0,
            animation: `sl-howlring .9s ease-out ${i * 0.14}s forwards`,
          }}
        />
      ))}
      {/* wolf silhouette (tilts up when howling) */}
      <svg
        viewBox="0 0 64 64"
        width="64"
        height="64"
        style={{
          transformOrigin: "50% 80%",
          transform: on ? "translateY(-2px)" : "translateY(0)",
          animation: on ? "sl-wolf-howl .95s ease-in-out" : undefined,
          filter: "drop-shadow(0 0 6px rgba(61,255,160,.55))",
        }}
      >
        <g fill={C.green}>
          {/* body */}
          <path d="M14 52 L18 36 L26 40 L38 40 L46 34 L50 52 Z" opacity="0.9" />
          {/* head tilted up to the sky */}
          <path d="M40 40 C40 30 44 22 52 16 L58 10 L54 20 L60 18 L52 26 C50 32 50 38 46 40 Z" />
          {/* ear */}
          <path d="M44 24 L47 16 L50 24 Z" />
          {/* eye */}
          <circle cx="47" cy="28" r="1.6" fill="#04140c" />
        </g>
      </svg>
    </div>
  );
}

/* 🐾 custom paw cursor that follows the mouse and stamps fading paw prints */
function PawCursor() {
  const cursor = useRef<HTMLDivElement | null>(null);
  const [paws, setPaws] = useState<{ id: number; x: number; y: number; rot: number }[]>([]);

  useEffect(() => {
    let last = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let acc = 0;
    let side = 1;
    let id = 0;

    const onMove = (e: PointerEvent | MouseEvent) => {
      const x = (e as MouseEvent).clientX;
      const y = (e as MouseEvent).clientY;
      if (cursor.current) cursor.current.style.transform = `translate(${x}px, ${y}px)`;

      const dx = x - last.x, dy = y - last.y;
      acc += Math.hypot(dx, dy);
      if (acc > 44) {
        acc = 0;
        const rot = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        const perp = ((rot - 90) * Math.PI) / 180;
        const off = 13 * side;
        side *= -1;
        const px = x + Math.cos(perp + Math.PI / 2) * off;
        const py = y + Math.sin(perp + Math.PI / 2) * off;
        const myId = id++;
        setPaws((p) => [...p.slice(-14), { id: myId, x: px, y: py, rot }]);
        window.setTimeout(() => setPaws((p) => p.filter((q) => q.id !== myId)), 950);
      }
      last = { x, y };
    };

    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5 }}>
      {paws.map((p) => (
        <svg
          key={p.id}
          viewBox="0 0 24 24"
          width="20"
          height="20"
          style={{
            position: "absolute",
            left: p.x,
            top: p.y,
            transform: `translate(-50%,-50%) rotate(${p.rot}deg)`,
            animation: "sl-paw .95s ease-out forwards",
          }}
        >
          <g fill={C.green}>
            <ellipse cx="12" cy="15" rx="5" ry="4.2" />
            <ellipse cx="6" cy="9" rx="2" ry="2.6" />
            <ellipse cx="10" cy="6" rx="2" ry="2.8" />
            <ellipse cx="14" cy="6" rx="2" ry="2.8" />
            <ellipse cx="18" cy="9" rx="2" ry="2.6" />
          </g>
        </svg>
      ))}
      {/* glowing paw cursor */}
      <div ref={cursor} style={{ position: "absolute", top: 0, left: 0, willChange: "transform" }}>
        <svg viewBox="0 0 24 24" width="26" height="26" style={{ transform: "translate(-50%,-50%)", filter: `drop-shadow(0 0 6px ${C.green})` }}>
          <g fill={C.green}>
            <ellipse cx="12" cy="15" rx="5.2" ry="4.4" />
            <ellipse cx="6" cy="9" rx="2.1" ry="2.7" />
            <ellipse cx="10" cy="6" rx="2.1" ry="2.9" />
            <ellipse cx="14" cy="6" rx="2.1" ry="2.9" />
            <ellipse cx="18" cy="9" rx="2.1" ry="2.7" />
          </g>
        </svg>
      </div>
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

/* FX */
@keyframes sl-scan { from { background-position: 0 0; } to { background-position: 0 60px; } }
@keyframes sl-ember { 0% { transform: translate(0,0) scale(1); opacity: 0; } 12% { opacity: .9; } 100% { transform: translate(var(--drift), -100vh) scale(.4); opacity: 0; } }
@keyframes sl-spark { 0% { transform: translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(var(--sx), var(--sy)) scale(.2); opacity: 0; } }
@keyframes sl-howlring { 0% { transform: scale(.3); opacity: .9; } 100% { transform: scale(3.4); opacity: 0; } }
@keyframes sl-wolf-howl { 0% { transform: translateY(0) rotate(0); } 30% { transform: translateY(-3px) rotate(-8deg); } 60% { transform: translateY(-3px) rotate(-8deg); } 100% { transform: translateY(0) rotate(0); } }
@keyframes sl-paw { 0% { opacity: 0; transform: translate(-50%,-50%) rotate(var(--r,0)) scale(.4); } 18% { opacity: .85; } 100% { opacity: 0; transform: translate(-50%,-50%) scale(1); } }
`;
