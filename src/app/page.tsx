"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, useDragControls } from "framer-motion";
import {
  UploadCloud,
  Sun,
  Wand2,
  Sparkles,
  ChevronRight,
  Eye,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock Data
const DEMO_IMAGE =
  "https://images.unsplash.com/photo-1513364776144-60967b0f800f?q=80&w=2071&auto=format&fit=crop";

const CRITIQUES = [
  {
    id: 1,
    x: 40,
    y: 25,
    text: "Anatomy: The foreshortening on this left arm is structurally flawed.",
  },
  {
    id: 2,
    x: 65,
    y: 50,
    text: "Composition: Lacks contrast. Deepen shadows to guide the eye.",
  },
  {
    id: 3,
    x: 30,
    y: 70,
    text: "Proportions: The lower body stance needs more dynamic weight distribution.",
  },
  {
    id: 4,
    x: 50,
    y: 15,
    text: "Lighting: A rim light here would separate the subject nicely.",
  },
];

export default function RedlineApp() {
  const [image, setImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"critique" | "relight">(
    "critique",
  );

  // Critique State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showCritique, setShowCritique] = useState(false);
  const [activeDot, setActiveDot] = useState<number | null>(null);

  // Relighting State
  const [sunPosition, setSunPosition] = useState({ x: 0, y: 0 });
  const [isRelighting, setIsRelighting] = useState(false);
  const [isRelit, setIsRelit] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handlers
  const handleLoadDemo = () => {
    setImage(DEMO_IMAGE);
    // Reset states
    setShowCritique(false);
    setIsRelit(false);
    setSunPosition({ x: 0, y: 0 });
  };

  const handleGenerateRedline = () => {
    setIsAnalyzing(true);
    // Simulate AI Vision API Call
    setTimeout(() => {
      setIsAnalyzing(false);
      setShowCritique(true);
    }, 2000);
  };

  const handleRelight = () => {
    setIsRelighting(true);
    // Simulate Image Gen API Call (e.g. Fal.ai / Stable Diffusion)
    setTimeout(() => {
      setIsRelighting(false);
      setIsRelit(true);
    }, 3000);
  };

  // Derive lighting prompt from sun position
  const getLightingPrompt = () => {
    const xDir =
      sunPosition.x > 50 ? "right" : sunPosition.x < -50 ? "left" : "center";
    const yDir =
      sunPosition.y > 50 ? "bottom" : sunPosition.y < -50 ? "top" : "front";
    return `Prompt: Dramatic rim lighting from ${yDir} ${xDir}`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col font-sans selection:bg-red-500/30">
      {/* Top Navbar */}
      <header className="h-16 border-b border-zinc-900/80 px-6 flex items-center justify-between shrink-0 glass z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.3)]">
            <Sparkles className="w-5 h-5 text-zinc-950" />
          </div>
          <span className="text-xl font-bold tracking-tight">Redline</span>
        </div>
        <div className="text-sm font-medium text-zinc-500 hidden sm:flex items-center gap-2">
          Professional critique.{" "}
          <span className="text-red-500/80">Zero ego.</span>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Canvas Workspace */}
        <section className="flex-1 relative bg-zinc-950 flex items-center justify-center p-8 overflow-hidden">
          {/* Grid Background Pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

          {!image ? (
            // State 1: Empty Canvas
            <div className="relative z-10 max-w-md w-full glass rounded-2xl p-10 flex flex-col items-center justify-center text-center border-dashed border-2 border-zinc-800 hover:border-red-500/50 transition-colors">
              <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-6 shadow-xl">
                <UploadCloud className="w-8 h-8 text-zinc-400" />
              </div>
              <h2 className="text-xl font-semibold mb-2">
                Drop your WIP sketch here
              </h2>
              <p className="text-zinc-500 text-sm mb-8">
                Supports PNG, JPG, or WEBP. Max size 10MB.
              </p>
              <button
                onClick={handleLoadDemo}
                className="group relative inline-flex items-center gap-2 bg-zinc-100 text-zinc-950 px-6 py-3 rounded-full font-medium hover:bg-white transition-all overflow-hidden"
              >
                <ImageIcon className="w-4 h-4" />
                Load Demo Sketch
              </button>
            </div>
          ) : (
            // State 2: Active Canvas
            <div
              ref={containerRef}
              className="relative w-full max-w-4xl aspect-[4/3] rounded-xl overflow-hidden shadow-2xl ring-1 ring-zinc-800 bg-zinc-900"
            >
              {/* Main Image */}
              <img
                src={image}
                alt="WIP Sketch"
                className={cn(
                  "w-full h-full object-cover transition-all duration-1000",
                  isRelit ? "brightness-110 contrast-125 saturate-110" : "",
                )}
                style={
                  isRelit
                    ? {
                        filter:
                          "drop-shadow(0 0 20px rgba(239, 68, 68, 0.1)) brightness(1.1) contrast(1.2)",
                      }
                    : undefined
                }
              />

              {/* Critique Overlay */}
              {activeTab === "critique" && showCritique && (
                <div className="absolute inset-0 z-10">
                  {CRITIQUES.map((critique) => (
                    <div
                      key={critique.id}
                      className="absolute"
                      style={{ left: `${critique.x}%`, top: `${critique.y}%` }}
                    >
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          delay: critique.id * 0.1,
                          type: "spring",
                        }}
                        className="relative group"
                      >
                        {/* Pulsing Dot */}
                        <div className="absolute -inset-2 bg-red-500/20 rounded-full animate-ping" />
                        <button
                          onMouseEnter={() => setActiveDot(critique.id)}
                          onMouseLeave={() => setActiveDot(null)}
                          className={cn(
                            "relative w-4 h-4 rounded-full border-2 border-zinc-950 transition-all shadow-lg",
                            activeDot === critique.id
                              ? "bg-red-400 scale-125"
                              : "bg-red-500 hover:bg-red-400",
                          )}
                        />

                        {/* Tooltip */}
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{
                            opacity: activeDot === critique.id ? 1 : 0,
                            y: activeDot === critique.id ? 0 : 10,
                            scale: activeDot === critique.id ? 1 : 0.95,
                            pointerEvents:
                              activeDot === critique.id ? "auto" : "none",
                          }}
                          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-4 w-64 glass p-4 rounded-xl text-sm leading-relaxed text-zinc-200 z-50 origin-bottom"
                        >
                          <div className="font-semibold text-red-400 mb-1 flex items-center gap-2">
                            <Eye className="w-3 h-3" /> Note
                          </div>
                          {critique.text}
                          {/* Triangle indicator */}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-zinc-800" />
                        </motion.div>
                      </motion.div>
                    </div>
                  ))}
                </div>
              )}

              {/* Relighting Overlay (Draggable Sun) */}
              {activeTab === "relight" && (
                <div className="absolute inset-0 z-20 pointer-events-none">
                  <motion.div
                    drag
                    dragConstraints={containerRef}
                    dragElastic={0.1}
                    onDrag={(e, info) =>
                      setSunPosition({
                        x: info.point.x - 400,
                        y: info.point.y - 300,
                      })
                    }
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-gradient-to-br from-amber-200 to-orange-500 shadow-[0_0_40px_rgba(245,158,11,0.5)] flex items-center justify-center cursor-grab active:cursor-grabbing pointer-events-auto"
                  >
                    <Sun className="w-8 h-8 text-orange-900" />
                  </motion.div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Control Sidebar */}
        <aside className="w-80 sm:w-96 border-l border-zinc-900/80 bg-zinc-950/50 backdrop-blur-3xl flex flex-col shrink-0 z-20">
          {/* Tabs */}
          <div className="flex p-4 gap-2 border-b border-zinc-900/80">
            <button
              onClick={() => setActiveTab("critique")}
              disabled={!image}
              className={cn(
                "flex-1 py-2.5 px-3 text-sm font-medium rounded-lg transition-all duration-200",
                activeTab === "critique"
                  ? "bg-zinc-800 text-zinc-50 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50",
                !image && "opacity-50 cursor-not-allowed",
              )}
            >
              Spatial Critique
            </button>
            <button
              onClick={() => setActiveTab("relight")}
              disabled={!image}
              className={cn(
                "flex-1 py-2.5 px-3 text-sm font-medium rounded-lg transition-all duration-200",
                activeTab === "relight"
                  ? "bg-zinc-800 text-zinc-50 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50",
                !image && "opacity-50 cursor-not-allowed",
              )}
            >
              Relighting
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {!image ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-zinc-600">
                <Wand2 className="w-8 h-8 mb-4 opacity-50" />
                <p className="text-sm">
                  Upload a sketch to
                  <br />
                  unlock AI director tools.
                </p>
              </div>
            ) : activeTab === "critique" ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-2">
                    The Anatomy Mentor
                  </h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Identify structural flaws and composition imbalances before
                    you commit to final rendering.
                  </p>
                </div>

                <button
                  onClick={handleGenerateRedline}
                  disabled={isAnalyzing || showCritique}
                  className="w-full relative group overflow-hidden rounded-xl bg-red-500 px-4 py-3 text-zinc-50 font-medium transition-all hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="relative z-10 flex items-center justify-center gap-2">
                    {isAnalyzing ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{
                            repeat: Infinity,
                            duration: 1,
                            ease: "linear",
                          }}
                        >
                          <LoaderIcon />
                        </motion.div>
                        Analyzing Structure...
                      </>
                    ) : showCritique ? (
                      <>
                        Critique Applied <ChevronRight className="w-4 h-4" />
                      </>
                    ) : (
                      <>Generate AI Redline</>
                    )}
                  </div>
                  {/* Shiny overlay effect */}
                  {!isAnalyzing && !showCritique && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                  )}
                </button>

                {showCritique && (
                  <div className="mt-8 space-y-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Analysis Output
                    </h4>
                    {CRITIQUES.map((c) => (
                      <div
                        key={c.id}
                        className={cn(
                          "glass p-4 rounded-xl text-sm transition-all cursor-default border-l-2 border-l-transparent",
                          activeDot === c.id
                            ? "border-l-red-500 bg-zinc-800/80"
                            : "hover:bg-zinc-800/40",
                        )}
                        onMouseEnter={() => setActiveDot(c.id)}
                        onMouseLeave={() => setActiveDot(null)}
                      >
                        <span className="text-zinc-300">{c.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-2">
                    Interactive Relighting
                  </h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Drag the sun over the canvas to preview structural lighting
                    and material bounce.
                  </p>
                </div>

                <div className="glass p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                    Live AI Prompt
                  </h4>
                  <p className="text-sm font-mono text-amber-400/90 leading-relaxed">
                    {getLightingPrompt()}
                  </p>
                </div>

                <button
                  onClick={handleRelight}
                  disabled={isRelighting}
                  className="w-full relative group overflow-hidden rounded-xl bg-amber-500 px-4 py-3 text-zinc-950 font-medium transition-all hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="relative z-10 flex items-center justify-center gap-2">
                    {isRelighting ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{
                            repeat: Infinity,
                            duration: 1,
                            ease: "linear",
                          }}
                        >
                          <LoaderIcon />
                        </motion.div>
                        Calculating light bounce...
                      </>
                    ) : (
                      <>Relight Canvas</>
                    )}
                  </div>
                  {!isRelighting && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                  )}
                </button>

                {isRelit && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-sm">
                    ✨ Preview generated. Ready for rendering.
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </main>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `,
        }}
      />
    </div>
  );
}

function LoaderIcon() {
  return (
    <svg
      className="w-5 h-5 text-current"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}
