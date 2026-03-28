"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Sparkles, Sun, Info, Crosshair, RefreshCcw, Layers, Layout, Brain, Search, Maximize2, Palette } from "lucide-react";
import clsx from "clsx";
import { analyzeImageStream } from "@/lib/gemini";

interface Critique {
  x: number;
  y: number;
  title: string;
  desc: string;
}

const SKETCH_URLS = [
  "https://images.unsplash.com/photo-1513364776144-60967b0f800f",
  "https://images.unsplash.com/photo-1543857778-c4a1a3e0b2eb",
  "https://images.unsplash.com/photo-1580136579312-94651dfd596d",
  "https://images.unsplash.com/photo-1614850523296-d8c1af93d400",
  "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5",
];

export default function Workspace() {
  const [image, setImage] = useState<string | null>(null);
  const [tab, setTab] = useState<"critique" | "relight" | "materials" | "layers">("critique");
  
  const [displayedCritiques, setDisplayedCritiques] = useState<Critique[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [sunPos, setSunPos] = useState({ x: 0, y: 0 });
  
  const canvasRef = useRef<HTMLDivElement>(null);

  const loadRandomImage = () => {
    const baseUrl = SKETCH_URLS[Math.floor(Math.random() * SKETCH_URLS.length)];
    const sig = Math.floor(Math.random() * 1000000);
    setImage(`${baseUrl}?auto=format&fit=crop&w=1200&q=80&sig=${sig}`);
    setDisplayedCritiques([]);
    setStatus("idle");
  };

  const handleCritique = async () => {
    if (!image) return;
    setStatus("loading");
    setDisplayedCritiques([]);
    
    try {
      const stream = analyzeImageStream(image);
      for await (const point of stream) {
        if (point && typeof point === 'object' && 'title' in point) {
          setDisplayedCritiques(prev => [...prev, point as Critique]);
        }
      }
    } catch (e) {
      console.error("Streaming UI Error:", e);
    } finally {
      setStatus("done");
    }
  };

  const getLightingPrompt = () => {
    const relX = sunPos.x;
    const relY = sunPos.y;
    if (relX === 0 && relY === 0) return "Direct front lighting, flat shadows.";
    let vertical = relY < -40 ? "top" : relY > 40 ? "bottom" : "center";
    let horizontal = relX < -40 ? "left" : relX > 40 ? "right" : "center";
    if (vertical === "center" && horizontal === "center") return "Direct front lighting, flat shadows.";
    return `Dramatic rim lighting from ${vertical} ${horizontal}.`;
  };

  const blurFade = {
    initial: { opacity: 0, filter: "blur(12px)" },
    animate: { opacity: 1, filter: "blur(0px)" },
    exit: { opacity: 0, filter: "blur(12px)" },
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
  };

  if (!image) {
    return (
      <div className="flex-1 flex items-center justify-center p-10 bg-[#fcfcfc]">
        <motion.div 
          {...blurFade}
          className="w-full max-w-xl aspect-[1.4] border border-zinc-200 rounded-lg flex flex-col items-center justify-center bg-white shadow-sm"
        >
          <h2 className="text-5xl font-bold text-zinc-800 mb-2 tracking-tighter italic font-serif">Redline</h2>
          <p className="text-zinc-400 text-xl mb-12 max-w-xs text-center leading-relaxed font-serif italic">
            Art direction for the analog-digital hybrid.
          </p>
          <button 
            onClick={loadRandomImage}
            className="px-14 py-4 bg-zinc-900 text-white font-bold rounded-full transition-all hover:bg-black active:opacity-90 shadow-lg text-lg tracking-tight font-outfit"
          >
            Open Sketchbook
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-[#fcfcfc] relative">
      {/* Sidebar Top Gradient Blur Overlay */}
      <div className="absolute top-0 right-0 w-[420px] h-32 z-30 pointer-events-none bg-[#fcfcfc] top-blur-mask backdrop-blur-sm opacity-80" />

      <div className="flex-1 relative flex items-center justify-center p-12 overflow-visible">
        <div 
          ref={canvasRef}
          className="relative paper-canvas bg-white p-4 overflow-visible"
        >
          <div className="relative inline-block overflow-visible border border-zinc-100 shadow-inner p-1">
            <motion.img 
              key={image}
              {...blurFade}
              src={image} 
              alt="WIP Sketch" 
              className={clsx(
                "max-h-[75vh] w-auto block object-contain grayscale-[0.2] transition-all duration-700",
                tab === "relight" ? "brightness-90 contrast-110" : "brightness-100 contrast-100"
              )}
              style={{
                filter: tab === "relight" 
                  ? `brightness(${1 - Math.abs(sunPos.y/1000)}) contrast(${1.1 + Math.abs(sunPos.x/1000)})`
                  : 'none',
              }}
            />

            <AnimatePresence>
              {tab === "relight" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 pointer-events-none mix-blend-soft-light"
                  style={{
                    background: `radial-gradient(circle at ${50 + (sunPos.x / 5)}% ${50 + (sunPos.y / 5)}%, rgba(255,255,255,0.8) 0%, transparent 60%)`,
                  }}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {tab === "layers" && (
                <motion.div
                  initial={{ opacity: 0, filter: "blur(15px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(15px)" }}
                  className="absolute inset-0 z-20 pointer-events-none"
                >
                   <div className="absolute inset-0 layer-gesture bg-red-500/5" />
                   <div className="grid grid-cols-3 grid-rows-3 w-full h-full opacity-30">
                      {[...Array(9)].map((_, i) => <div key={i} className="border border-red-900/40 border-dashed" />)}
                   </div>
                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-2 border-red-500/10 rounded-full scale-110 opacity-40 blur-[1px]" />
                </motion.div>
              )}
              {tab === "materials" && (
                <motion.div
                  initial={{ opacity: 0, filter: "blur(20px)" }}
                  animate={{ opacity: 0.3, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(20px)" }}
                  className="absolute inset-0 z-20 pointer-events-none mix-blend-multiply rounded-xl overflow-hidden"
                  style={{
                    background: `
                      radial-gradient(circle at 30% 20%, #ff4d4d 0%, transparent 40%),
                      radial-gradient(circle at 70% 60%, #4da6ff 0%, transparent 40%),
                      radial-gradient(circle at 50% 40%, #ffcc00 0%, transparent 30%)
                    `,
                    filter: 'contrast(1.5) saturate(2)'
                  }}
                />
              )}
            </AnimatePresence>

            <div className="absolute inset-0 z-40 pointer-events-none overflow-visible">
              <AnimatePresence>
                {displayedCritiques.map((dot, i) => (
                  <RedlineMark key={`${image}-${i}`} dot={dot} index={i} />
                ))}
              </AnimatePresence>
            </div>
          </div>

          <AnimatePresence>
            {tab === "relight" && (
              <motion.div
                initial={{ opacity: 0, filter: "blur(10px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(10px)" }}
                drag
                dragConstraints={canvasRef}
                dragElastic={0}
                onDrag={(_, info) => setSunPos({ x: info.offset.x, y: info.offset.y })}
                className="absolute top-1/2 left-1/2 w-14 h-14 -mt-7 -ml-7 bg-white border-2 border-zinc-200 rounded-full cursor-grab active:cursor-grabbing shadow-2xl flex items-center justify-center z-50 transition-shadow hover:shadow-[0_0_30px_rgba(245,158,11,0.2)]"
              >
                <div className="w-10 h-10 rounded-full bg-yellow-400/5 flex items-center justify-center">
                  <Sun className="text-yellow-600/60" size={24} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <motion.div 
        initial={{ x: 400 }}
        animate={{ x: 0 }}
        className="w-[420px] bg-white border-l border-zinc-200 flex flex-col z-40 relative overflow-hidden shadow-[-20px_0_60px_rgba(0,0,0,0.02)]"
      >
        <div className="p-10 border-b border-zinc-100 bg-white/50 backdrop-blur-md relative z-10">
          <h1 className="text-4xl font-bold text-zinc-900 tracking-tighter mb-2 font-serif">Director's Ledger</h1>
          <p className="text-zinc-400 text-lg italic leading-tight font-serif italic">Observations on structural integrity.</p>
        </div>

        <div className="flex p-2 gap-1 border-b border-zinc-50 bg-[#fafafa] overflow-x-auto no-scrollbar relative z-10">
          <button onClick={() => setTab("critique")} className={clsx("flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all shrink-0 font-outfit", tab === "critique" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400")}>Critique</button>
          <button onClick={() => setTab("relight")} className={clsx("flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all shrink-0 font-outfit", tab === "relight" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400")}>Relight</button>
          <button onClick={() => setTab("materials")} className={clsx("flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all shrink-0 font-outfit", tab === "materials" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400")}>Surfaces</button>
          <button onClick={() => setTab("layers")} className={clsx("flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all shrink-0 font-outfit", tab === "layers" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400")}>Layers</button>
        </div>

        <div className="flex-1 p-10 overflow-y-auto relative z-10">
          {tab === "critique" ? (
            <div className="space-y-10">
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-zinc-900 uppercase tracking-widest font-outfit">Art Director</h3>
                <p className="text-zinc-500 font-serif text-xl leading-snug italic">"Identify the rhythm of the gesture before the weight of the shadow."</p>
              </div>
              {(status === "idle" || status === "loading") && status !== "done" && displayedCritiques.length === 0 && (
                <button 
                  onClick={handleCritique} 
                  disabled={status === "loading"}
                  className="w-full py-5 bg-zinc-900 text-white font-bold rounded-xl shadow-xl transition-all active:opacity-80 text-lg font-outfit disabled:opacity-50"
                >
                  {status === "loading" ? "Observing..." : "Analyze Piece"}
                </button>
              )}
              {(status === "done" || displayedCritiques.length > 0) && (
                <motion.div {...blurFade} className="space-y-8">
                  <div className="p-8 border border-zinc-100 bg-zinc-50/50 rounded-2xl text-center">
                    <p className="text-zinc-600 text-lg font-serif italic">Mapped {displayedCritiques.length} structural markings.</p>
                  </div>
                  <div className="space-y-4">
                    {displayedCritiques.map((c, i) => (
                      <div key={i} className="p-4 border-b border-zinc-50 flex items-center justify-between group cursor-default">
                        {c && (
                          <div>
                            <span className="text-[10px] font-bold text-red-700 uppercase tracking-widest block mb-1 font-outfit">Point {i + 1}</span>
                            <span className="text-xl font-bold text-zinc-800 tracking-tight font-serif">{c.title}</span>
                          </div>
                        )}
                        <Search size={16} className="text-zinc-300 group-hover:text-red-500 transition-colors" />
                      </div>
                    ))}
                  </div>
                  {status === "done" && (
                    <button onClick={() => {setStatus("idle"); setDisplayedCritiques([])}} className="w-full py-4 border border-zinc-200 text-zinc-400 font-bold rounded-xl transition-all text-xs uppercase tracking-widest font-outfit">Reset Analysis</button>
                  )}
                </motion.div>
              )}
            </div>
          ) : tab === "relight" ? (
            <div className="space-y-10">
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-zinc-900 uppercase tracking-widest font-outfit">Light Engine</h3>
                <p className="text-zinc-500 font-serif text-xl leading-snug italic">Simulate volume and depth via dynamic structural lighting.</p>
              </div>
              <div className="p-8 border border-zinc-100 bg-zinc-50/50 rounded-2xl text-center">
                <p className="text-zinc-600 text-sm font-medium leading-relaxed font-serif italic">Move the light source on the canvas to recalculate core shadows and ambient occlusion.</p>
              </div>
              <div className="p-6 border border-zinc-100 bg-zinc-50 rounded-xl flex items-center justify-center gap-4">
                 <Palette size={20} className="text-zinc-300" />
                 <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest font-outfit">Calculated Volume Active</span>
              </div>
            </div>
          ) : tab === "materials" ? (
            <div className="space-y-10">
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-zinc-900 uppercase tracking-widest font-outfit">Surface Scanner</h3>
                <p className="text-zinc-500 font-serif text-xl leading-snug italic">Determine physical properties and sub-surface scattering estimates.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 border border-zinc-100 bg-zinc-50/50 rounded-xl">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1 font-outfit">Roughness</span>
                  <span className="text-2xl font-bold text-zinc-800 font-serif">0.42</span>
                </div>
                <div className="p-5 border border-zinc-100 bg-zinc-50/50 rounded-xl">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1 font-outfit">Metallic</span>
                  <span className="text-2xl font-bold text-zinc-800 font-serif">0.08</span>
                </div>
              </div>
              <div className="p-6 border border-zinc-100 bg-zinc-50/50 rounded-2xl text-center">
                <p className="text-zinc-600 text-sm font-medium italic font-serif">Surface heat-map active. Review highlighted zones for texture consistency.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-zinc-900 uppercase tracking-widest font-outfit">Layer Explorer</h3>
                <p className="text-zinc-500 font-serif text-xl leading-snug italic">Deconstruct composition into foundational elements.</p>
              </div>
              <div className="space-y-4">
                {[
                  { name: "Composition Grid", status: "Thirds", icon: Layout },
                  { name: "Focus Planes", status: "Golden", icon: Maximize2 },
                  { name: "Gesture Rhythm", status: "Calculated", icon: Brain },
                ].map((item, i) => (
                  <div key={i} className="p-5 border border-zinc-100 bg-zinc-50/50 rounded-xl flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <item.icon size={18} className="text-zinc-400" />
                      <span className="text-sm font-bold text-zinc-700 font-outfit">{item.name}</span>
                    </div>
                    <span className="text-xs font-bold text-red-700 uppercase tracking-widest font-outfit">{item.status}</span>
                  </div>
                ))}
              </div>
              <p className="text-zinc-400 text-sm font-serif italic text-center px-4 leading-relaxed">Structural guides assist in identifying stagnation in the silhouette and gesture.</p>
            </div>
          )}
        </div>
        
        <div className="p-10 bg-zinc-50/30 border-t border-zinc-100 relative z-10">
           <button onClick={loadRandomImage} className="w-full py-4 bg-white text-zinc-900 font-bold rounded-xl transition-all border border-zinc-200 shadow-sm hover:shadow-md text-lg tracking-tight font-outfit active:opacity-80">Next Canvas</button>
        </div>
      </motion.div>
    </div>
  );
}

function RedlineMark({ dot, index }: { dot: Critique; index: number }) {
  const [isHovered, setIsHovered] = useState(false);
  if (!dot) return null;

  const isNearRight = dot.x > 70;
  const isNearLeft = dot.x < 30;
  const isNearTop = dot.y < 30;
  const xPositionClass = isNearRight ? "right-0 translate-x-4" : isNearLeft ? "left-0 -translate-x-4" : "left-1/2 -translate-x-1/2";
  const yPositionClass = isNearTop ? "top-12" : "bottom-12";
  const initialY = isNearTop ? -10 : 10;

  return (
    <motion.div
      initial={{ opacity: 0, filter: "blur(10px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="absolute z-40 pointer-events-auto"
      style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => setIsHovered(!isHovered)}
    >
      <div className="relative flex items-center justify-center cursor-pointer group">
        <div className="w-6 h-6 flex items-center justify-center">
          <div className="absolute inset-0 bg-red-600/30 rounded-full animate-ping opacity-50" />
          <div className="w-3.5 h-3.5 bg-red-600 rounded-full border-2 border-white shadow-[0_0_15px_rgba(220,38,38,0.6)] group-hover:scale-125 transition-transform" />
        </div>
      </div>
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: initialY, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: initialY, filter: "blur(12px)" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={clsx(
              "absolute w-80 bg-white border border-zinc-200 p-10 rounded-sm shadow-[0_30px_100px_rgba(0,0,0,0.15)] overflow-visible",
              xPositionClass, 
              yPositionClass,
              "z-[100]"
            )}
            style={{ transform: `rotate(${(index % 2 === 0 ? 1 : -1) * 1.5}deg)` }}
          >
            <h4 className="text-[10px] font-bold text-red-700 mb-4 uppercase tracking-[0.3em] font-outfit">Director's Note</h4>
            <p className="text-2xl text-zinc-800 leading-tight italic font-serif">{dot.desc}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
