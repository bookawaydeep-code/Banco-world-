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
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** Fire-and-forget audio that never throws if the asset/autoplay is blocked. */
function safePlay(src: string, volume = 0.7) {
  try {
    const a = new Audio(src);
    a.volume = volume;
    void a.play().catch(() => {});
    return a;
  } catch {
    return null;
  }
}

interface SoundifiedLoaderProps {
  /** Called once the whole intro animation has finished. */
  onComplete?: () => void;
  /** Milliseconds spent in the "loading" phase before the reveal. */
  loadingMs?: number;
}

export default function SoundifiedLoader({
  onComplete,
  loadingMs = 3000,
}: SoundifiedLoaderProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [step, setStep] = useState(0);
  const reduced = useRef(prefersReducedMotion());
  const timers = useRef<number[]>([]);

  // ---- step ticker (the "Booting audio engine…" lines) ----
  useEffect(() => {
    if (phase !== "loading") return;
    const per = loadingMs / STEPS.length;
    const id = window.setInterval(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, per);
    timers.current.push(id);
    return () => window.clearInterval(id);
  }, [phase, loadingMs]);

  // ---- master timeline ----
  useEffect(() => {
    const t = timers.current;
    const after = (ms: number, fn: () => void) =>
      t.push(window.setTimeout(fn, reduced.current ? Math.min(ms, 200) : ms));

    // build-up riser through the whole loading phase
    const riser = !reduced.current ? safePlay(riserSfx, 0.5) : null;

    // loading -> verify : checkmark snaps in, then RIPS into a music note
    after(loadingMs, () => {
      riser?.pause();
      safePlay(hitSfx, 0.85); // the "reveal hit"
      setPhase("verify");
    });

    // verify -> out : the audio wave sweeps in and shoves the note aside
    after(loadingMs + 1400, () => setPhase("out"));

    // done
    after(loadingMs + 2300, () => onComplete?.());

    return () => {
      riser?.pause();
      t.forEach((id) => window.clearTimeout(id));
      t.forEach((id) => window.clearInterval(id));
      t.length = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`sl-root sl-${phase}`} role="status" aria-label="Loading">
      <style>{CSS}</style>

      {/* graffiti wall backdrop + paint splatter */}
      <img className="sl-wall" src={wall} alt="" aria-hidden />
      <img className="sl-splatter" src={splatter} alt="" aria-hidden />
      <div className="sl-vignette" aria-hidden />

      <div className="sl-stage">
        <svg className="sl-icon" viewBox="0 0 120 120" aria-hidden>
          {/* 1. checkmark draws + snaps in */}
          <path className="sl-check" d="M30 62 L52 84 L92 38" />

          {/* 2. the rip / tear that flashes as it morphs */}
          <path className="sl-rip" d="M48 30 L56 44 L46 52 L58 64 L50 76 L60 88" />

          {/* 3. music note that forms out of the tear */}
          <g className="sl-note">
            <rect x="64" y="22" width="6" height="56" rx="3" />
            <path d="M70 22 C70 22 92 26 92 44 C92 50 84 52 80 48 C86 48 86 38 70 36 Z" />
            <ellipse
              cx="56"
              cy="80"
              rx="14"
              ry="10"
              transform="rotate(-18 56 80)"
            />
          </g>
        </svg>

        {/* 4. audio wave that pushes the note out of the way */}
        <div className="sl-wave" aria-hidden>
          {[18, 46, 78, 110, 78, 46, 18].map((h, i) => (
            <span key={i} style={{ height: h, animationDelay: `${(i % 4) * 0.08}s` }} />
          ))}
        </div>
      </div>

      <div className="sl-steps" aria-live="polite">
        {phase === "loading" ? (
          <span className="sl-step">{STEPS[step]}</span>
        ) : (
          <span className="sl-step sl-step--done">Ready</span>
        )}
      </div>
    </div>
  );
}

const CSS = `
:root { --sl-green:#22c55e; --sl-glow:#4ade80; }

.sl-root{
  position:fixed; inset:0; z-index:9999;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:42px; overflow:hidden;
  background:#0b1120;
  font-family:"Segoe UI",system-ui,-apple-system,sans-serif;
  transition:opacity .6s ease;
}
.sl-out{ opacity:0; pointer-events:none; }

.sl-wall,.sl-splatter{
  position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; user-select:none; pointer-events:none;
}
.sl-wall{ opacity:.35; filter:saturate(1.1) brightness(.7); }
.sl-splatter{ opacity:0; mix-blend-mode:screen; transition:opacity .4s ease; }
.sl-verify .sl-splatter,.sl-out .sl-splatter{ opacity:.55; }
.sl-vignette{
  position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(circle at 50% 42%, transparent 40%, rgba(0,0,0,.75) 100%);
}

.sl-stage{ position:relative; width:200px; height:200px; display:grid; place-items:center; }
.sl-icon{ width:200px; height:200px; overflow:visible; }

/* ---- checkmark ---- */
.sl-check{
  fill:none; stroke:var(--sl-green); stroke-width:10;
  stroke-linecap:round; stroke-linejoin:round;
  stroke-dasharray:90; stroke-dashoffset:90;
  filter:drop-shadow(0 0 8px var(--sl-glow));
}
.sl-loading .sl-check{ animation:sl-draw 1s ease forwards, sl-pop 1.4s ease 1s; }
.sl-verify .sl-check{ animation:sl-rip-out .45s ease forwards; }
.sl-out .sl-check{ opacity:0; }

/* ---- the rip ---- */
.sl-rip{
  fill:none; stroke:#eafff1; stroke-width:3; stroke-linecap:round; opacity:0;
}
.sl-verify .sl-rip{ animation:sl-rip-flash .5s ease forwards; }

/* ---- music note ---- */
.sl-note{
  fill:var(--sl-green); transform-origin:center; opacity:0;
  transform:scale(.2) rotate(-25deg);
  filter:drop-shadow(0 0 10px var(--sl-glow));
}
.sl-verify .sl-note{ animation:sl-note-form .6s cubic-bezier(.2,1.4,.4,1) .2s forwards; }
.sl-out .sl-note{ opacity:1; animation:sl-note-shove .8s cubic-bezier(.5,0,.7,1) forwards; }

/* ---- audio wave ---- */
.sl-wave{
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  gap:6px; pointer-events:none; opacity:0;
  transform:translateX(-180px) scaleX(.6);
}
.sl-wave span{
  display:block; width:6px; border-radius:6px;
  background:linear-gradient(var(--sl-glow),var(--sl-green));
  box-shadow:0 0 10px var(--sl-glow);
  animation:sl-bars .6s ease-in-out infinite;
}
.sl-out .sl-wave{ animation:sl-wave-sweep .8s ease-out forwards; }

/* ---- steps text ---- */
.sl-steps{ height:20px; }
.sl-step{
  color:#cbd5e1; letter-spacing:.3em; font-size:13px; text-transform:uppercase;
}
.sl-step::after{ content:"…"; }
.sl-step--done{ color:var(--sl-green); }
.sl-step--done::after{ content:""; }

@keyframes sl-draw{ to{ stroke-dashoffset:0; } }
@keyframes sl-pop{ 0%,100%{transform:scale(1)} 30%{transform:scale(1.08)} }
@keyframes sl-rip-out{ to{ opacity:0; transform:scale(1.2); } }
@keyframes sl-rip-flash{
  0%{opacity:0; transform:scaleY(.4)} 40%{opacity:1; transform:scaleY(1)}
  100%{opacity:0; transform:scaleY(1.3)}
}
@keyframes sl-note-form{
  0%{opacity:0; transform:scale(.2) rotate(-25deg)}
  70%{opacity:1; transform:scale(1.1) rotate(0)}
  100%{opacity:1; transform:scale(1) rotate(0)}
}
@keyframes sl-note-shove{
  0%{transform:scale(1) rotate(0) translateX(0); opacity:1}
  60%{transform:scale(.92) rotate(12deg) translateX(220px); opacity:1}
  100%{transform:scale(.8) rotate(18deg) translateX(360px); opacity:0}
}
@keyframes sl-wave-sweep{
  0%{opacity:0; transform:translateX(-180px) scaleX(.6)}
  35%{opacity:1; transform:translateX(-60px) scaleX(.9)}
  70%{opacity:1; transform:translateX(80px) scaleX(1)}
  100%{opacity:0; transform:translateX(260px) scaleX(.7)}
}
@keyframes sl-bars{ 0%,100%{transform:scaleY(.5)} 50%{transform:scaleY(1)} }

@media (prefers-reduced-motion: reduce){
  .sl-check,.sl-rip,.sl-note,.sl-wave,.sl-wave span{ animation-duration:.001s !important; }
}
`;
