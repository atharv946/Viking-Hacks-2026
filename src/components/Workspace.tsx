"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Sparkles, Sun, Info, Crosshair, RefreshCcw } from "lucide-react";
import clsx from "clsx";

const MOCK_DOTS = [
  { x: 40, y: 25, title: "Anatomy Flaw", desc: "The foreshortening on this left arm is structurally flawed." },
  { x: 65, y: 50, title: "Composition", desc: "Lacks contrast. Deepen shadows to guide the eye." },
  { x: 30, y: 70, title: "Proportion", desc: "The leg to torso ratio appears slightly elongated." },
  { x: 80, y: 20, title: "Lighting", desc: "Light source is ambiguous here. Commit to a direction." },
];

export default function Workspace() {
  const [image, setImage] = useState<string | null>(null);
  const [tab, setTab] = useState<"critique" | "relight">("critique");
  
  const [critiqueStatus, setCritiqueStatus] = useState<"idle" | "loading" | "done">("idle");
  const [relightStatus, setRelightStatus] = useState<"idle" | "loading" | "done">("idle");
  const [sunPos, setSunPos] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleCritique = () => {
    setCritiqueStatus("loading");
    // Mock API call to Vision API (e.g., OpenAI or Fal.ai)
    setTimeout(() => {
      setCritiqueStatus("done");
    }, 2000);
  };

  const handleRelight = () => {
    setRelightStatus("loading");
    // Mock API call to Image-to-Image Relighting API
    setTimeout(() => {
      setRelightStatus("done");
    }, 3000);
  };

  const getLightingPrompt = () => {
    if (!canvasRef.current) return "Dynamic lighting prompt based on position.";
    const rect = canvasRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    let vertical = sunPos.y < 0 ? "top" : "bottom";
    if (Math.abs(sunPos.y) < rect.height / 4) vertical = "center";
    
    let horizontal = sunPos.x < 0 ? "left" : "right";
    if (Math.abs(sunPos.x) < rect.width / 4) horizontal = "center";

    if (vertical === "center" && horizontal === "center") return "Direct front lighting, flat shadows.";
    return `Dramatic rim lighting from ${vertical} ${horizontal}.`;
  };

  if (!image) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-zinc-950/50 relative overflow-hidden">
        {/* Decorative background blur */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-red-500/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="w-full max-w-3xl aspect-[16/10] border-2 border-dashed border-zinc-800 rounded-3xl flex flex-col items-center justify-center bg-zinc-900/30 hover:bg-zinc-900/50 transition-all cursor-pointer group backdrop-blur-sm z-10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/0 via-zinc-800/5 to-zinc-800/20 group-hover:opacity-100 opacity-0 transition-opacity" />
          <Upload className="text-zinc-600 mb-6 group-hover:text-red-500 transition-colors duration-500 transform group-hover:-translate-y-2 group-hover:scale-110" size={56} />
          <h2 className="text-2xl font-bold text-zinc-200 mb-2 tracking-tight">Drop your WIP sketch here</h2>
          <p className="text-zinc-500 mb-8">JPG, PNG, or WEBP up to 20MB</p>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setImage("https://images.unsplash.com/photo-1543857778-c4a1a3e0b2eb?auto=format&fit=crop&w=1200&q=80");
              }}
              className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl transition-all active:scale-95 border border-zinc-700 hover:border-zinc-600 shadow-lg"
            >
              Load Demo Sketch
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-zinc-950 relative">
      {/* Main Canvas Area */}
      <div className="flex-1 relative flex items-center justify-center p-8 overflow-hidden">
        {/* Background ambient glow */}
        <div className="absolute inset-0 bg-zinc-950" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div 
          ref={canvasRef}
          className="relative max-w-full max-h-full rounded-lg shadow-2xl ring-1 ring-zinc-800 flex items-center justify-center z-10"
        >
          <motion.img 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            src={image} 
            alt="WIP Sketch" 
            className={clsx(
              "max-h-[85vh] object-contain rounded-lg transition-all duration-1000",
              relightStatus === "done" && tab === "relight" ? "brightness-110 contrast-125 saturate-150" : "brightness-100 contrast-100"
            )}
            style={{
               filter: relightStatus === "done" && tab === "relight" ? 'brightness(1.1) contrast(1.25) drop-shadow(0 0 40px rgba(250,250,250,0.1))' : 'none'
            }}
          />

          {/* Spatial Critique Dots Overlay */}
          <AnimatePresence>
            {tab === "critique" && critiqueStatus === "done" && (
              MOCK_DOTS.map((dot, i) => (
                <CritiqueDot key={i} dot={dot} index={i} />
              ))
            )}
          </AnimatePresence>

          {/* Interactive Relighting Sun Overlay */}
          <AnimatePresence>
            {tab === "relight" && (
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                drag
                dragConstraints={canvasRef}
                dragElastic={0.1}
                onDrag={(_, info) => setSunPos({ x: info.offset.x, y: info.offset.y })}
                className="absolute top-1/2 left-1/2 w-12 h-12 -mt-6 -ml-6 bg-yellow-400 rounded-full cursor-grab active:cursor-grabbing shadow-[0_0_40px_rgba(250,204,21,0.6)] flex items-center justify-center z-20"
              >
                <Sun className="text-yellow-700" size={24} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right Sidebar */}
      <motion.div 
        initial={{ x: 400 }}
        animate={{ x: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
        className="w-96 border-l border-zinc-800 bg-zinc-900/40 backdrop-blur-xl flex flex-col shadow-2xl z-20"
      >
        <div className="flex p-4 gap-2 border-b border-zinc-800/60">
          <button 
            onClick={() => setTab("critique")}
            className={clsx(
              "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
              tab === "critique" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <Crosshair size={16} /> Critique
          </button>
          <button 
            onClick={() => setTab("relight")}
            className={clsx(
              "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
              tab === "relight" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <Sun size={16} /> Relight
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {tab === "critique" ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2 mb-2">
                  <Sparkles className="text-red-500" size={20} />
                  Spatial Critique
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  The Anatomy Mentor uses vision models to analyze structural flaws, composition, and proportion in your WIP sketch.
                </p>
              </div>

              {critiqueStatus === "idle" && (
                <button 
                  onClick={handleCritique}
                  className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl shadow-[0_0_20px_rgba(239,68,68,0.2)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
                >
                  <Sparkles className="group-hover:rotate-12 transition-transform" size={20} />
                  Generate AI Redline
                </button>
              )}

              {critiqueStatus === "loading" && (
                <div className="w-full py-8 border border-zinc-800 rounded-xl bg-zinc-900/50 flex flex-col items-center justify-center gap-4">
                  <div className="w-8 h-8 border-4 border-zinc-700 border-t-red-500 rounded-full animate-spin" />
                  <span className="text-sm text-zinc-400 font-medium animate-pulse">Running Vision Analysis...</span>
                </div>
              )}

              {critiqueStatus === "done" && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/10 text-green-400 text-sm flex items-start gap-3">
                    <Info size={18} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold mb-1">Analysis Complete</p>
                      <p className="text-green-500/80">Found 4 potential areas for improvement. Hover over the red dots on the canvas.</p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setCritiqueStatus("idle")}
                    className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCcw size={16} /> Reset Analysis
                  </button>
                </motion.div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2 mb-2">
                  <Sun className="text-yellow-500" size={20} />
                  Interactive Relighting
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Drag the sun icon over the canvas to set a light source. The AI will simulate realistic light bounces on your 2D sketch.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900 shadow-inner">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Generated Prompt</span>
                <p className="text-sm text-zinc-300 font-mono leading-relaxed h-12">
                  {getLightingPrompt()}
                </p>
              </div>

              {relightStatus === "idle" && (
                <button 
                  onClick={handleRelight}
                  className="w-full py-4 bg-zinc-100 hover:bg-white text-zinc-900 font-semibold rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
                >
                  <Sparkles size={20} />
                  Relight Canvas
                </button>
              )}

              {relightStatus === "loading" && (
                <div className="w-full py-8 border border-zinc-800 rounded-xl bg-zinc-900/50 flex flex-col items-center justify-center gap-4">
                  <div className="w-8 h-8 border-4 border-zinc-700 border-t-zinc-200 rounded-full animate-spin" />
                  <span className="text-sm text-zinc-400 font-medium animate-pulse">Calculating light bounce...</span>
                </div>
              )}

              {relightStatus === "done" && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 text-sm flex items-start gap-3">
                    <Sparkles size={18} className="mt-0.5 shrink-0 text-yellow-500" />
                    <div>
                      <p className="font-semibold mb-1 text-zinc-100">Relighting Applied</p>
                      <p className="text-zinc-400">Previewing simulated lighting. For final quality, export to hi-res.</p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setRelightStatus("idle")}
                    className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCcw size={16} /> Adjust Lighting
                  </button>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function CritiqueDot({ dot, index }: { dot: any; index: number }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.2, type: "spring", stiffness: 300 }}
      className="absolute z-30"
      style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => setIsHovered(!isHovered)}
    >
      <div className="relative flex items-center justify-center cursor-pointer">
        <div className="absolute w-6 h-6 bg-red-500/30 rounded-full pulse-ring" />
        <div className="w-3 h-3 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.8)] border border-white/20 z-10" />
      </div>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 w-64 glass p-4 rounded-xl z-40"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <h4 className="text-sm font-bold text-zinc-100">{dot.title}</h4>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {dot.desc}
            </p>
            <div className="mt-3 flex gap-2">
              <button className="text-[10px] font-semibold bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded text-zinc-300 transition-colors">
                Fix with AI
              </button>
              <button className="text-[10px] font-semibold bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded text-zinc-300 transition-colors">
                Ignore
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
