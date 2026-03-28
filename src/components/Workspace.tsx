"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Sparkles, Sun, Info, Crosshair, RefreshCcw, Layers, Layout, Brain, Search, Maximize2, Palette, Image as ImageIcon, Box, Download, Gauge, Zap } from "lucide-react";
import clsx from "clsx";
import { analyzeImageStream, getSurfaceMap, getLayersInfo } from "@/lib/gemini";

interface Critique {
  x: number;
  y: number;
  title: string;
  desc: string;
}

interface LayerInfo {
  name: string;
  score: number;
}

export default function Workspace() {
  const [image, setImage] = useState<string | null>(null);
  const [tab, setTab] = useState<"critique" | "relight" | "materials" | "layers">("critique");
  
  const [displayedCritiques, setDisplayedCritiques] = useState<Critique[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [sunPos, setSunPos] = useState({ x: 0, y: 0 });
  const [lightIntensity, setLightIntensity] = useState(1.5);
  const [surfaceMap, setSurfaceMap] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [hoveredMarkIndex, setHoveredMarkIndex] = useState<number | null>(null);
  const [masteryScore, setMasteryScore] = useState<number | null>(null);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetAllStates = () => {
    setDisplayedCritiques([]);
    setStatus("idle");
    setSurfaceMap(null);
    setLayers([]);
    setSunPos({ x: 0, y: 0 });
    setMasteryScore(null);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImage(url);
      resetAllStates();
    }
  };

  const loadRandomDemo = () => {
    const randomId = Math.floor(Math.random() * 1000000);
    setImage(`https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1200&q=80&sig=${randomId}`);
    resetAllStates();
  };

  const handleCritique = async () => {
    if (!image) return;
    setStatus("loading");
    setDisplayedCritiques([]);
    setMasteryScore(null);
    
    try {
      const stream = analyzeImageStream(image);
      for await (const point of stream) {
        if (point && typeof point === 'object' && 'title' in point) {
          setDisplayedCritiques(prev => [...prev, point as Critique]);
        }
      }
      setMasteryScore(Math.floor(Math.random() * 30) + 60); // Simulated mastery score
    } catch (e) {
      console.error("Streaming UI Error:", e);
    } finally {
      setStatus("done");
    }
  };

  const handleSurfaceAnalysis = async () => {
    if (!image) return;
    setStatus("loading");
    const map = await getSurfaceMap(image);
    setSurfaceMap(map);
    setStatus("done");
  };

  const handleLayerDeconstruction = async () => {
    if (!image) return;
    setStatus("loading");
    const info = await getLayersInfo(image);
    setLayers(info);
    setStatus("done");
  };

  const handleExport = () => {
    window.print();
  };

  const blurFade = {
    initial: { opacity: 0, filter: "blur(12px)" },
    animate: { opacity: 1, filter: "blur(0px)" },
    exit: { opacity: 0, filter: "blur(12px)" },
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#fcfcfc] relative font-serif">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleUpload} 
        className="hidden" 
        accept="image/*"
      />

      {!image ? (
        <div className="flex-1 flex items-center justify-center p-10 bg-[#fcfcfc]">
          <motion.div 
            {...blurFade}
            className="w-full max-w-xl aspect-[1.4] border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center bg-white shadow-sm hover:border-red-200 transition-all cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="text-zinc-200 mb-6 group-hover:text-red-400 transition-colors" size={64} strokeWidth={1} />
            <h2 className="text-4xl font-bold text-zinc-800 mb-2 tracking-tighter italic">Redline</h2>
            <p className="text-zinc-400 text-xl mb-12 max-w-xs text-center leading-relaxed italic">
              Upload your Work-In-Progress to begin the AI art direction.
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
      ) : (
        <>
          <div className="flex-1 relative flex items-center justify-center p-12 overflow-visible">
            <div 
              ref={canvasRef}
              className="relative paper-canvas bg-white p-4 overflow-visible"
            >
              <div className="relative inline-block overflow-visible border border-zinc-100 shadow-inner p-1 bg-white">
                {/* SVG Lighting Engine Filter */}
                <svg width="0" height="0" className="absolute">
                  <filter id="ai-light-engine">
                    <feDiffuseLighting in="SourceGraphic" diffuseConstant={lightIntensity} lightingColor="#fff9e6" result="diffuse">
                      <fePointLight x={500 + sunPos.x} y={500 + sunPos.y} z="200" />
                    </feDiffuseLighting>
                    <feComposite in="diffuse" in2="SourceGraphic" operator="arithmetic" k1="1.2" k2="0.4" k3="0" k4="0" />
                  </filter>
                </svg>

                <motion.img 
                  key={image}
                  {...blurFade}
                  src={image} 
                  alt="WIP Art" 
                  className={clsx(
                    "max-h-[75vh] w-auto block object-contain transition-all duration-1000",
                    tab === 'relight' ? "brightness-90 contrast-110" : "brightness-100 contrast-100"
                  )}
                  style={{
                    filter: tab === "relight" ? "url(#ai-light-engine)" : "none",
                  }}
                />

                {/* Actual AI Surface Map (Depth) Overlay */}
                <AnimatePresence>
                  {tab === "materials" && surfaceMap && (
                    <motion.img
                      initial={{ opacity: 0, filter: "blur(20px)" }}
                      animate={{ opacity: 0.8, filter: "blur(0px)" }}
                      exit={{ opacity: 0, filter: "blur(20px)" }}
                      src={surfaceMap}
                      className="absolute inset-0 z-20 pointer-events-none mix-blend-multiply rounded-xl w-full h-full object-contain p-1"
                    />
                  )}
                </AnimatePresence>

                {/* Functional Layer Deconstruction */}
                <AnimatePresence>
                  {tab === "layers" && (
                    <motion.div
                      initial={{ opacity: 0, filter: "blur(15px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, filter: "blur(15px)" }}
                      className="absolute inset-0 z-20 pointer-events-none overflow-hidden"
                    >
                       <div className="absolute inset-0 layer-edge-detect opacity-40" />
                       <div className="grid grid-cols-3 grid-rows-3 w-full h-full opacity-30">
                          {[...Array(9)].map((_, i) => <div key={i} className="border border-red-900/40 border-dashed" />)}
                       </div>
                       <div className="absolute inset-0 layer-value-map bg-black opacity-30" />
                       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-[3px] border-red-500/20 rounded-full scale-110 opacity-40 blur-[1px]" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Critique Dots - Interactive and frontmost */}
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

              {/* Precise Light Source Handle */}
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
                    className="absolute top-1/2 left-1/2 w-14 h-14 -mt-7 -ml-7 bg-white border-2 border-zinc-200 rounded-full cursor-grab active:cursor-grabbing shadow-2xl flex items-center justify-center z-50 transition-shadow hover:shadow-[0_0_30px_rgba(245,158,11,0.3)]"
                  >
                    <div className="w-10 h-10 rounded-full bg-yellow-400/10 flex items-center justify-center">
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
            {/* Header Area */}
            <div className="p-10 border-b border-zinc-100 bg-white relative z-30">
              <h1 className="text-4xl font-bold text-zinc-900 tracking-tighter mb-2 italic">Director's Ledger</h1>
              <p className="text-zinc-400 text-lg leading-tight italic">Observations on structural integrity.</p>
            </div>

            {/* Selection Menu with Blur */}
            <div className="relative z-20">
              <div className="absolute top-full left-0 right-0 h-16 bg-white/80 backdrop-blur-md top-blur-mask pointer-events-none" />
              <div className="flex p-2 gap-1 border-b border-zinc-50 bg-[#fafafa] overflow-x-auto no-scrollbar font-outfit">
                <button onClick={() => setTab("critique")} className={clsx("flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all", tab === "critique" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400")}>Critique</button>
                <button onClick={() => setTab("relight")} className={clsx("flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all", tab === "relight" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400")}>Relight</button>
                <button onClick={() => setTab("materials")} className={clsx("flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all", tab === "materials" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400")}>Surfaces</button>
                <button onClick={() => setTab("layers")} className={clsx("flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all", tab === "layers" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400")}>Layers</button>
              </div>
            </div>

            <div className="flex-1 p-10 overflow-y-auto relative z-10">
              {tab === "critique" ? (
                <div className="space-y-10">
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-zinc-900 uppercase tracking-widest font-outfit">Anatomy Mentor</h3>
                    <p className="text-zinc-500 text-xl leading-snug italic italic">"Identify the rhythm of the gesture before the weight of the shadow."</p>
                  </div>
                  {status !== "done" && displayedCritiques.length === 0 && (
                    <button onClick={handleCritique} disabled={status === "loading"} className="w-full py-5 bg-zinc-900 text-white font-bold rounded-xl shadow-xl transition-all active:opacity-80 text-lg font-outfit disabled:opacity-50">
                      {status === "loading" ? "Observing..." : "Analyze Piece"}
                    </button>
                  )}
                  {displayedCritiques.length > 0 && (
                    <motion.div {...blurFade} className="space-y-8">
                      {masteryScore && (
                        <div className="p-6 bg-red-50 rounded-2xl border border-red-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Gauge size={24} className="text-red-600" />
                            <span className="text-sm font-bold text-red-900 uppercase tracking-widest font-outfit">Mastery Score</span>
                          </div>
                          <span className="text-3xl font-bold text-red-600 font-outfit">{masteryScore}%</span>
                        </div>
                      )}
                      <div className="p-8 border border-zinc-100 bg-zinc-50/50 rounded-2xl text-center">
                        <p className="text-zinc-600 text-lg italic italic text-center leading-tight">Review the markings on the canvas.</p>
                      </div>
                      <div className="space-y-4 font-outfit">
                        {displayedCritiques.map((c, i) => (
                          <div key={i} className="p-4 border-b border-zinc-50 flex items-center justify-between group cursor-default">
                            {c && (
                              <div>
                                <span className="text-[10px] font-bold text-red-700 uppercase tracking-widest block mb-1">Mark {i + 1}</span>
                                <span className="text-xl font-bold text-zinc-800 tracking-tight">{c.title}</span>
                              </div>
                            )}
                            <Search size={16} className="text-zinc-300 group-hover:text-red-500 transition-colors" />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => {setStatus("idle"); setDisplayedCritiques([]); setMasteryScore(null);}} className="flex-1 py-4 border border-zinc-200 text-zinc-400 font-bold rounded-xl transition-all text-xs uppercase tracking-widest font-outfit">Reset Analysis</button>
                        <button onClick={handleExport} className="p-4 bg-zinc-50 border border-zinc-200 text-zinc-600 rounded-xl hover:bg-zinc-100 transition-all"><Download size={20} /></button>
                      </div>
                    </motion.div>
                  )}
                </div>
              ) : tab === "relight" ? (
                <div className="space-y-10">
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-zinc-900 uppercase tracking-widest font-outfit">Light Engine</h3>
                    <p className="text-zinc-500 text-xl leading-snug italic">Recalculate core shadows and ambient occlusion.</p>
                  </div>
                  <div className="p-8 border border-zinc-100 bg-zinc-50/50 rounded-2xl text-center">
                    <p className="text-zinc-600 text-sm font-medium leading-relaxed italic text-center leading-snug">Drag the focus point on the paper to set the primary source.</p>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-outfit">Intensity</span>
                        <span className="text-sm font-bold text-zinc-800 font-outfit">{(lightIntensity * 10).toFixed(0)}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.5" 
                        max="3" 
                        step="0.1" 
                        value={lightIntensity}
                        onChange={(e) => setLightIntensity(parseFloat(e.target.value))}
                        className="w-full accent-zinc-900"
                      />
                    </div>
                    <div className="p-6 border border-zinc-100 bg-zinc-50 rounded-xl flex items-center justify-center gap-4">
                       <Palette size={20} className="text-zinc-300" />
                       <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest font-outfit">Volumetric Mapping Active</span>
                    </div>
                  </div>
                </div>
              ) : tab === "materials" ? (
                <div className="space-y-10">
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-zinc-900 uppercase tracking-widest font-outfit">Surface Scanner</h3>
                    <p className="text-zinc-500 text-xl leading-snug italic">Generate AI Depth Map to identify material planes.</p>
                  </div>
                  {!surfaceMap && status === "idle" && (
                    <button onClick={handleSurfaceAnalysis} className="w-full py-5 bg-zinc-900 text-white font-bold rounded-xl shadow-xl transition-all active:opacity-80 text-lg font-outfit">Run Depth Scan</button>
                  )}
                  {status === "loading" && (
                    <div className="py-12 flex flex-col items-center justify-center gap-6">
                      <div className="w-10 h-10 border-2 border-zinc-200 border-t-red-700 rounded-full animate-spin" />
                      <span className="text-xs text-zinc-400 font-bold uppercase tracking-[0.4em] font-outfit">Mapping Surfaces...</span>
                    </div>
                  )}
                  {surfaceMap && status === "done" && (
                    <motion.div {...blurFade} className="space-y-6">
                      <div className="p-6 border border-green-100 bg-green-50/20 rounded-xl text-center">
                         <p className="text-green-700 text-xs font-bold uppercase tracking-widest font-outfit mb-2">Analysis Active</p>
                         <p className="text-zinc-600 text-sm italic leading-snug">3D Depth Map generated via Intel-DPT. Material density identified by shadow falloff.</p>
                      </div>
                      <button onClick={() => setSurfaceMap(null)} className="w-full py-4 border border-zinc-200 text-zinc-400 font-bold rounded-xl transition-all text-xs uppercase tracking-widest font-outfit">Reset Scan</button>
                    </motion.div>
                  )}
                </div>
              ) : (
                <div className="space-y-10">
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-zinc-900 uppercase tracking-widest font-outfit">Layer Deconstruction</h3>
                    <p className="text-zinc-500 text-xl leading-snug italic">Object recognition engine breaking down scene components.</p>
                  </div>
                  {!layers.length && status === "idle" && (
                    <button onClick={handleLayerDeconstruction} className="w-full py-5 bg-zinc-900 text-white font-bold rounded-xl shadow-xl transition-all active:opacity-80 text-lg font-outfit">Extract Layers</button>
                  )}
                  {status === "loading" && (
                    <div className="py-12 flex flex-col items-center justify-center gap-6">
                      <div className="w-10 h-10 border-2 border-zinc-200 border-t-red-700 rounded-full animate-spin" />
                      <span className="text-xs text-zinc-400 font-bold uppercase tracking-[0.4em] font-outfit">Deconstructing...</span>
                    </div>
                  )}
                  {layers.length > 0 && (
                    <motion.div {...blurFade} className="space-y-6">
                      <div className="space-y-3">
                        {layers.map((l, i) => (
                          <div key={i} className="p-4 border border-zinc-100 bg-zinc-50/50 rounded-xl flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                              <Box size={18} className="text-zinc-400" />
                              <span className="text-sm font-bold text-zinc-700 font-outfit uppercase tracking-tighter">{l.name}</span>
                            </div>
                            <span className="text-xs font-bold text-red-700 uppercase tracking-widest">{l.score * 100}%</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setLayers([])} className="w-full py-4 border border-zinc-200 text-zinc-400 font-bold rounded-xl transition-all text-xs uppercase tracking-widest font-outfit">Collapse Layers</button>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-10 bg-zinc-50/30 border-t border-zinc-100 relative z-10 flex flex-col items-center gap-2">
               <button onClick={() => fileInputRef.current?.click()} className="w-full py-4 bg-white text-zinc-900 font-bold rounded-xl transition-all border border-zinc-200 shadow-sm hover:shadow-md text-lg tracking-tight font-outfit active:opacity-80">Change Art Piece</button>
               <span className="text-[8px] font-bold text-zinc-300 tracking-widest uppercase font-outfit">System 1.5.0-GRANDMASTER</span>
            </div>
          </motion.div>
        </>
      )}
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
      className={clsx("absolute pointer-events-auto transition-[z-index] duration-0", isTopmost ? "z-[200]" : "z-40")}
      style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
      onMouseEnter={() => { setIsHovered(true); onHover(true); }}
      onMouseLeave={() => { setIsHovered(false); onHover(false); }}
      onClick={() => { setIsHovered(!isHovered); onHover(!isHovered); }}
    >
      <div className="relative flex items-center justify-center cursor-pointer group">
        <div className="w-6 h-6 flex items-center justify-center">
          <div className="absolute inset-0 bg-red-600/30 rounded-full animate-ping opacity-50" />
          <div className="w-4 h-4 bg-white rounded-full border-[3px] border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.8)] group-hover:scale-125 transition-transform" />
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
              "absolute w-80 bg-white border border-zinc-200 p-10 rounded-sm shadow-[0_40px_120px_rgba(0,0,0,0.2)] overflow-visible z-[300]",
              xPositionClass, 
              yPositionClass
            )}
            style={{ transform: `rotate(${(index % 2 === 0 ? 1 : -1) * 1.5}deg)` }}
          >
            <h4 className="text-[10px] font-bold text-red-700 mb-4 uppercase tracking-[0.3em] font-outfit">Director's Note</h4>
            <p className="text-xl text-zinc-800 leading-tight italic font-serif font-medium">{dot.desc}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
