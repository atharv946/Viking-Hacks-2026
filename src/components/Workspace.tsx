"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Sparkles, Sun, Info, Crosshair, RefreshCcw, Layers, Layout, Brain, Search, Maximize2, Palette, Image as ImageIcon } from "lucide-react";
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
  const [isRelit, setIsRelit] = useState(false);
  const [hoveredMarkIndex, setHoveredMarkIndex] = useState<number | null>(null);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImage(url);
      setDisplayedCritiques([]);
      setStatus("idle");
      setIsRelit(false);
    }
  };

  const loadRandomDemo = () => {
    const baseUrl = SKETCH_URLS[Math.floor(Math.random() * SKETCH_URLS.length)];
    const sig = Math.floor(Math.random() * 1000000);
    setImage(`${baseUrl}?auto=format&fit=crop&w=1200&q=80&sig=${sig}`);
    setDisplayedCritiques([]);
    setStatus("idle");
    setIsRelit(false);
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

  const handleRelightModel = () => {
    setStatus("loading");
    setTimeout(() => {
      setIsRelit(true);
      setStatus("done");
    }, 2000);
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
          className="w-full max-w-xl aspect-[1.4] border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center bg-white shadow-sm hover:border-red-200 transition-all cursor-pointer group"
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleUpload} 
            className="hidden" 
            accept="image/*"
          />
          <ImageIcon className="text-zinc-200 mb-6 group-hover:text-red-400 transition-colors" size={64} strokeWidth={1} />
          <h2 className="text-4xl font-bold text-zinc-800 mb-2 tracking-tighter italic font-serif">Redline</h2>
          <p className="text-zinc-400 text-xl mb-12 max-w-xs text-center leading-relaxed font-serif italic">
            Upload your Work-In-Progress to begin the critique.
          </p>
          <div className="flex items-center gap-4">
            <button className="px-10 py-4 bg-zinc-900 text-white font-bold rounded-full transition-all hover:bg-black active:opacity-90 shadow-lg text-lg tracking-tight font-outfit">
              Select Art
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); loadRandomDemo(); }}
              className="text-zinc-400 hover:text-zinc-600 font-bold text-sm underline underline-offset-4 font-outfit"
            >
              Load Demo
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-[#fcfcfc] relative">
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
              alt="WIP Art" 
              className={clsx(
                "max-h-[75vh] w-auto block object-contain transition-all duration-1000",
                !isRelit && tab !== 'layers' && "grayscale-[0.2]",
                isRelit && tab === "relight" && "brightness-110 contrast-125 saturate-110 shadow-2xl"
              )}
              style={{
                filter: isRelit && tab === "relight" 
                  ? `drop-shadow(0 0 40px rgba(255,255,255,0.2)) brightness(${1.1 - Math.abs(sunPos.y/2000)})`
                  : 'none',
              }}
            />

            <AnimatePresence>
              {tab === "relight" && isRelit && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.6 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 pointer-events-none mix-blend-soft-light"
                  style={{
                    background: `radial-gradient(circle at ${50 + (sunPos.x / 5)}% ${50 + (sunPos.y / 5)}%, rgba(255,255,255,1) 0%, transparent 70%)`,
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
                   <div className="grid grid-cols-3 grid-rows-3 w-full h-full opacity-30">
                      {[...Array(9)].map((_, i) => <div key={i} className="border border-red-900/40 border-dashed" />)}
                   </div>
                   <div className="absolute inset-0 layer-value-map bg-black opacity-20" />
                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-[1px] border-red-500/20 rounded-full scale-110 opacity-40" />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute inset-0 z-40 pointer-events-none overflow-visible">
              <AnimatePresence>
                {tab === "critique" && displayedCritiques.map((dot, i) => (
                  <RedlineMark 
                    key={`${image}-${i}`} 
                    dot={dot} 
                    index={i} 
                    isTopmost={hoveredMarkIndex === i}
                    onHover={(hover) => setHoveredMarkIndex(hover ? i : null)}
                  />
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
                dragMomentum={false}
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
        className="w-[420px] bg-white border-l border-zinc-200 flex flex-col z-40 shadow-[-20px_0_60px_rgba(0,0,0,0.02)] relative"
      >
        <div className="absolute top-0 left-0 right-0 h-32 bg-white/80 backdrop-blur-md top-blur-mask z-30 pointer-events-none" />

        <div className="p-10 border-b border-zinc-100 relative z-10">
          <h1 className="text-4xl font-bold text-zinc-900 tracking-tighter mb-2 font-serif">Director's Ledger</h1>
          <p className="text-zinc-400 text-lg italic leading-tight font-serif italic">Observations on structural integrity.</p>
        </div>

        <div className="flex p-2 gap-1 border-b border-zinc-50 bg-[#fafafa] overflow-x-auto no-scrollbar relative z-10 font-outfit">
          <button onClick={() => setTab("critique")} className={clsx("flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all", tab === "critique" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400")}>Critique</button>
          <button onClick={() => setTab("relight")} className={clsx("flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all", tab === "relight" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400")}>Relight</button>
          <button onClick={() => setTab("materials")} className={clsx("flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all", tab === "materials" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400")}>Surfaces</button>
          <button onClick={() => setTab("layers")} className={clsx("flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all", tab === "layers" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400")}>Layers</button>
        </div>

        <div className="flex-1 p-10 overflow-y-auto relative z-10">
          {tab === "critique" ? (
            <div className="space-y-10">
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-zinc-900 uppercase tracking-widest font-outfit">Anatomy Mentor</h3>
                <p className="text-zinc-500 font-serif text-xl leading-snug italic italic">"Identify the rhythm of the gesture before the weight of the shadow."</p>
              </div>
              {status !== "done" && displayedCritiques.length === 0 && (
                <button onClick={handleCritique} disabled={status === "loading"} className="w-full py-5 bg-zinc-900 text-white font-bold rounded-xl shadow-xl transition-all active:opacity-80 text-lg font-outfit disabled:opacity-50">
                  {status === "loading" ? "Observing..." : "Run Engine"}
                </button>
              )}
              {displayedCritiques.length > 0 && (
                <motion.div {...blurFade} className="space-y-8">
                  <div className="p-8 border border-zinc-100 bg-zinc-50/50 rounded-2xl text-center">
                    <p className="text-zinc-600 text-lg font-serif italic italic">Found {displayedCritiques.length} structural inconsistencies.</p>
                  </div>
                  <div className="space-y-4">
                    {displayedCritiques.map((c, i) => (
                      <div key={i} className="p-4 border-b border-zinc-50 flex items-center justify-between group cursor-default">
                        {c && (
                          <div>
                            <span className="text-[10px] font-bold text-red-700 uppercase tracking-widest block mb-1 font-outfit">Mark {i + 1}</span>
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
                <p className="text-zinc-500 font-serif text-xl leading-snug italic">Calculate volumetric depth through shadow projection.</p>
              </div>
              <div className="p-8 border border-zinc-100 bg-zinc-50/50 rounded-2xl text-center">
                <p className="text-zinc-600 text-sm font-medium leading-relaxed font-serif italic text-center">Drag the focus point on the paper to set the primary source.</p>
              </div>
              {!isRelit && status === "idle" && (
                <button onClick={handleRelightModel} className="w-full py-5 bg-zinc-900 text-white font-bold rounded-xl shadow-xl transition-all active:opacity-80 text-lg font-outfit">Process Lighting Model</button>
              )}
              {status === "loading" && (
                <div className="py-12 flex flex-col items-center justify-center gap-6 animate-pulse">
                  <div className="w-8 h-8 border-2 border-zinc-200 border-t-yellow-500 rounded-full animate-spin" />
                  <span className="text-xs text-zinc-400 font-bold uppercase tracking-[0.4em] font-outfit">Simulating Bounce...</span>
                </div>
              )}
              {isRelit && status === "done" && (
                <div className="p-6 border border-green-100 bg-green-50/20 rounded-xl text-center">
                   <p className="text-green-700 text-xs font-bold uppercase tracking-widest font-outfit mb-2">Model Active</p>
                   <p className="text-zinc-600 text-sm font-serif italic leading-snug">Shadow masks and ambient occlusion recalculated based on source vector.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-24 text-center space-y-6">
               <Layers className="mx-auto text-zinc-200" size={48} strokeWidth={1} />
               <p className="text-zinc-400 font-serif italic text-lg leading-snug max-w-[200px] mx-auto italic">Deconstructing the sketch into functional structural layers.</p>
            </div>
          )}
        </div>
        
        <div className="p-10 bg-zinc-50/30 border-t border-zinc-100 relative z-10 flex flex-col items-center gap-2">
           <button onClick={() => fileInputRef.current?.click()} className="w-full py-4 bg-white text-zinc-900 font-bold rounded-xl transition-all border border-zinc-200 shadow-sm hover:shadow-md text-lg tracking-tight font-outfit active:opacity-80">Change Art Piece</button>
           <span className="text-[8px] font-bold text-zinc-300 tracking-widest uppercase font-outfit">System 1.2.0-STABLE</span>
        </div>
      </motion.div>
    </div>
  );
}

function RedlineMark({ dot, index, isTopmost, onHover }: { dot: Critique; index: number; isTopmost: boolean; onHover: (hover: boolean) => void }) {
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
      className={clsx("absolute pointer-events-auto", isTopmost ? "z-[60]" : "z-40")}
      style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
      onMouseEnter={() => { setIsHovered(true); onHover(true); }}
      onMouseLeave={() => { setIsHovered(false); onHover(false); }}
      onClick={() => { setIsHovered(!isHovered); onHover(!isHovered); }}
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
            <p className="text-2xl text-zinc-800 leading-tight italic font-serif italic">{dot.desc}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
