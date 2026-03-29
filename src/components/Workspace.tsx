"use client";

import { memo, startTransition, useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  Crosshair,
  Download,
  Eye,
  Gauge,
  Image as ImageIcon,
  Layout,
  Search,
  Sun,
} from "lucide-react";
import clsx from "clsx";
import { analyzeImageStream } from "@/lib/gemini";
import {
  extractRegionDataUrl,
  generateLayerAnalysis,
  generateReadabilityAnalysis,
  generateRelightPass,
  generateStudioAnalysis,
  type CompositionMetric,
  type CropSuggestion,
  type LayerMetric,
  type ReadabilityAnalysis,
  type RegionBounds,
  type StudioAnalysis,
} from "@/lib/vision";

interface Critique {
  x: number;
  y: number;
  title: string;
  desc: string;
}

interface RegionDraft {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface LocalMentorPass {
  cropUrl: string;
  relightUrl: string | null;
  readability: ReadabilityAnalysis | null;
  critiques: Critique[];
}

type ToolTab = "critique" | "relight" | "layers" | "framing" | "palette" | "readability";
type ToolStatus = "idle" | "loading" | "done";

const SKETCH_URLS = [
  "https://images.unsplash.com/photo-1513364776144-60967b0f800f",
  "https://images.unsplash.com/photo-1543857778-c4a1a3e0b2eb",
  "https://images.unsplash.com/photo-1580136579312-94651dfd596d",
  "https://images.unsplash.com/photo-1614850523296-d8c1af93d400",
  "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5",
];

const toolItems: Array<{ id: ToolTab; icon: typeof Crosshair; label: string }> = [
  { id: "critique", icon: Crosshair, label: "Critique" },
  { id: "relight", icon: Sun, label: "Relight" },
  { id: "layers", icon: Layout, label: "Layers" },
  { id: "framing", icon: Search, label: "Framing" },
  { id: "palette", icon: Gauge, label: "Style DNA" },
  { id: "readability", icon: Eye, label: "Readability" },
];

const paperPrimaryButton =
  "soft-sheen w-full rounded-[20px] border border-zinc-900/10 bg-[#2f211a] px-5 py-3.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[#f8efe3] shadow-[0_16px_34px_rgba(47,33,26,0.18)] transition hover:-translate-y-0.5 hover:bg-[#241813] active:translate-y-0 font-outfit disabled:cursor-not-allowed disabled:opacity-60";
const paperSecondaryButton =
  "w-full rounded-[20px] border border-[#d7c4af] bg-[#fbf4ea] px-5 py-3.5 text-[10px] font-bold uppercase tracking-[0.24em] text-[#574237] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_24px_rgba(87,66,55,0.08)] transition hover:-translate-y-0.5 hover:bg-[#f6ede1] active:translate-y-0 font-outfit";
const DEFAULT_SUN_POS = { x: 190, y: -132 };
const DEFAULT_LIGHT_INTENSITY = 1.95;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function scoreToPercent(score: number) {
  return `${Math.round(score * 100)}%`;
}

function scoreTone(score: number) {
  if (score > 0.78) return "Excellent";
  if (score > 0.58) return "Strong";
  if (score > 0.38) return "Developing";
  return "Needs Push";
}

function getMoodTags(analysis: StudioAnalysis | null) {
  if (!analysis) return [];

  const tags: string[] = [];
  const { contrast, saturation, warmth, symmetry, focus } = analysis.creativeDNA;

  tags.push(contrast > 0.68 ? "High Drama" : "Soft Read");
  tags.push(saturation > 0.62 ? "Chromatic Energy" : "Muted Control");
  tags.push(warmth > 0.56 ? "Warm Bias" : "Cool Bias");
  tags.push(symmetry > 0.62 ? "Iconic Balance" : "Organic Asymmetry");
  tags.push(focus > 0.6 ? "Directed Eye Flow" : "Diffuse Attention");

  return tags;
}

function getCreativeDirection(analysis: StudioAnalysis | null) {
  if (!analysis) {
    return "Run a studio pass to generate compositional and stylistic direction.";
  }

  const { contrast, saturation, warmth, balance, focus } = analysis.creativeDNA;

  if (contrast > 0.7 && focus > 0.6) {
    return "The piece already wants to read cinematically. Push hierarchy and it can land with poster-level clarity.";
  }
  if (saturation > 0.62 && warmth > 0.55) {
    return "The image carries a vivid, energetic color signature. Tightening value control will make that energy feel intentional instead of noisy.";
  }
  if (balance > 0.65) {
    return "The composition feels structurally stable. The strongest gain now is sharpening focal contrast rather than rearranging the whole frame.";
  }

  return "The piece has good raw material, but it needs a stronger separation between primary read, supporting shapes, and ambient texture.";
}

function getVisionScore(masteryScore: number | null, analysis: StudioAnalysis | null) {
  const mastery = masteryScore ? masteryScore / 100 : 0.74;
  if (!analysis) {
    return Math.round(mastery * 100);
  }

  const dna = analysis.creativeDNA;
  return Math.round((mastery * 0.34 + dna.focus * 0.18 + dna.balance * 0.18 + dna.contrast * 0.15 + dna.saturation * 0.15) * 100);
}

function getReadabilitySummary(readability: ReadabilityAnalysis | null) {
  if (!readability) {
    return "Run the readability test to see whether the piece still makes sense when viewed quickly or at a small size.";
  }

  if (readability.metrics.thumbnailRead > 0.72) {
    return "Even at a glance, the main idea still reads clearly. That means the composition is carrying the image, not just the detail.";
  }
  if (readability.metrics.silhouetteClarity < 0.54) {
    return "The big shape gets muddy at small size. A viewer may feel the image is busy before they understand what matters.";
  }

  return "The piece has a readable core, but you can make it much stronger by simplifying the supporting detail around the main subject.";
}

function getActionPlan(analysis: StudioAnalysis | null, critiques: Critique[], readability: ReadabilityAnalysis | null) {
  const actions: string[] = [];

  if (analysis) {
    if (analysis.creativeDNA.focus < 0.56) {
      actions.push("Push one dominant focal region and simplify competing detail around it.");
    }
    if (analysis.creativeDNA.balance < 0.58) {
      actions.push("Rebalance the frame by redistributing visual weight across the left and right read.");
    }
    if (analysis.creativeDNA.contrast < 0.52) {
      actions.push("Separate your light and dark families more clearly before adding more rendering.");
    }
    if (analysis.creativeDNA.saturation > 0.68) {
      actions.push("Reserve your strongest color accents for the intended focal path so the palette feels designed.");
    }
  }

  if (readability) {
    if (readability.metrics.thumbnailRead < 0.56) {
      actions.push("Strengthen the thumbnail read by simplifying secondary detail and committing to larger value masses.");
    }
    if (readability.metrics.silhouetteClarity < 0.54) {
      actions.push("Separate the main silhouette more clearly from surrounding shapes before refining texture or rendering.");
    }
  }

  for (const critique of critiques.slice(0, 3)) {
    actions.push(`${critique.title}: ${critique.desc}`);
  }

  if (actions.length === 0) {
    actions.push("Run a full audit to generate the next-pass plan.");
  }

  return actions.slice(0, 3);
}

export default function Workspace() {
  const [image, setImage] = useState<string | null>(null);
  const [tab, setTab] = useState<ToolTab>("critique");
  const [displayAspectRatio, setDisplayAspectRatio] = useState(1.18);
  const [displayedCritiques, setDisplayedCritiques] = useState<Critique[]>([]);
  const [toolStatus, setToolStatus] = useState<Record<ToolTab, ToolStatus>>({
    critique: "idle",
    relight: "idle",
    layers: "idle",
    framing: "idle",
    palette: "idle",
    readability: "idle",
  });
  const [sunPos, setSunPos] = useState({ x: 0, y: 0 });
  const [lightIntensity, setLightIntensity] = useState(DEFAULT_LIGHT_INTENSITY);
  const [layers, setLayers] = useState<LayerMetric[]>([]);
  const [layerOverlay, setLayerOverlay] = useState<string | null>(null);
  const [studioAnalysis, setStudioAnalysis] = useState<StudioAnalysis | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<RegionBounds | null>(null);
  const [regionDraft, setRegionDraft] = useState<RegionDraft | null>(null);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);
  const [localPass, setLocalPass] = useState<LocalMentorPass | null>(null);
  const [localPassStatus, setLocalPassStatus] = useState<"idle" | "loading" | "done">("idle");
  const [hoveredMarkIndex, setHoveredMarkIndex] = useState<number | null>(null);
  const [masteryScore, setMasteryScore] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  const [isRelit, setIsRelit] = useState(false);
  const [relitImage, setRelitImage] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isMentorOpen, setIsMentorOpen] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [readabilityAnalysis, setReadabilityAnalysis] = useState<ReadabilityAnalysis | null>(null);
  const [isMirrored, setIsMirrored] = useState(false);
  const [isValueView, setIsValueView] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const imageStageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const relightJobRef = useRef(0);
  const blobUrlRef = useRef<string | null>(null);
  const critiqueFlushFrameRef = useRef<number | null>(null);
  const critiqueBufferRef = useRef<Critique[]>([]);
  const landingDragDepthRef = useRef(0);
  const pendingRegionPointRef = useRef<{ x: number; y: number } | null>(null);
  const regionFrameRef = useRef<number | null>(null);
  const pendingSunPosRef = useRef<{ x: number; y: number } | null>(null);
  const sunFrameRef = useRef<number | null>(null);
  const canvasDragDepthRef = useRef(0);

  const setStatusFor = (tool: ToolTab, next: ToolStatus) => {
    setToolStatus((prev) => (prev[tool] === next ? prev : { ...prev, [tool]: next }));
  };

  const setStatuses = (tools: ToolTab[], next: ToolStatus) => {
    setToolStatus((prev) => {
      let changed = false;
      const update = { ...prev };
      for (const tool of tools) {
        if (update[tool] !== next) {
          update[tool] = next;
          changed = true;
        }
      }
      return changed ? update : prev;
    });
  };

  const flushCritiqueBuffer = (immediate = false) => {
    const applyBuffer = () => {
      critiqueFlushFrameRef.current = null;
      if (critiqueBufferRef.current.length === 0) {
        return;
      }

      const points = critiqueBufferRef.current.splice(0);
      startTransition(() => {
        setDisplayedCritiques((prev) => [...prev, ...points]);
      });
    };

    if (immediate) {
      if (critiqueFlushFrameRef.current !== null) {
        window.cancelAnimationFrame(critiqueFlushFrameRef.current);
      }
      applyBuffer();
      return;
    }

    if (critiqueFlushFrameRef.current === null) {
      critiqueFlushFrameRef.current = window.requestAnimationFrame(applyBuffer);
    }
  };

  const resetAllStates = () => {
    relightJobRef.current += 1;
    if (critiqueFlushFrameRef.current !== null) {
      window.cancelAnimationFrame(critiqueFlushFrameRef.current);
      critiqueFlushFrameRef.current = null;
    }
    if (regionFrameRef.current !== null) {
      window.cancelAnimationFrame(regionFrameRef.current);
      regionFrameRef.current = null;
    }
    if (sunFrameRef.current !== null) {
      window.cancelAnimationFrame(sunFrameRef.current);
      sunFrameRef.current = null;
    }
    critiqueBufferRef.current = [];
    pendingRegionPointRef.current = null;
    pendingSunPosRef.current = null;
    landingDragDepthRef.current = 0;
    canvasDragDepthRef.current = 0;
    setDisplayedCritiques([]);
    setToolStatus({
      critique: "idle",
      relight: "idle",
      layers: "idle",
      framing: "idle",
      palette: "idle",
      readability: "idle",
    });
    setLayers([]);
    setLayerOverlay(null);
    setStudioAnalysis(null);
    setSelectedRegion(null);
    setRegionDraft(null);
    setIsSelectingRegion(false);
    setLocalPass(null);
    setLocalPassStatus("idle");
    setSunPos({ x: 0, y: 0 });
    setLightIntensity(DEFAULT_LIGHT_INTENSITY);
    setMasteryScore(null);
    setHoveredMarkIndex(null);
    setIsRelit(false);
    setRelitImage(null);
    setIsAuditing(false);
    setIsMentorOpen(false);
    setIsPlanOpen(false);
    setReadabilityAnalysis(null);
    setIsCanvasDragging(false);
    setIsMirrored(false);
    setIsValueView(false);
    setDisplayAspectRatio(1.18);
  };

  const replaceImage = (nextImage: string, shouldCleanupBlob = false) => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    if (shouldCleanupBlob) {
      blobUrlRef.current = nextImage;
    }
    setImage(nextImage);
    resetAllStates();
  };

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      if (critiqueFlushFrameRef.current !== null) {
        window.cancelAnimationFrame(critiqueFlushFrameRef.current);
      }
      if (regionFrameRef.current !== null) {
        window.cancelAnimationFrame(regionFrameRef.current);
      }
      if (sunFrameRef.current !== null) {
        window.cancelAnimationFrame(sunFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncDesktopState = () => {
      setIsDesktop(mediaQuery.matches);
    };

    syncDesktopState();
    mediaQuery.addEventListener("change", syncDesktopState);
    return () => {
      mediaQuery.removeEventListener("change", syncDesktopState);
    };
  }, []);

  useEffect(() => {
    if (!image || !isRelit) {
      return;
    }

    const bounds = imageStageRef.current?.getBoundingClientRect() ?? canvasRef.current?.getBoundingClientRect();
    const width = bounds?.width ?? 900;
    const height = bounds?.height ?? 900;
    const normalizedX = clamp01((sunPos.x / Math.max(width * 0.24, 1) + 1) * 0.5) * 2 - 1;
    const normalizedY = clamp01((sunPos.y / Math.max(height * 0.24, 1) + 1) * 0.5) * 2 - 1;
    const jobId = ++relightJobRef.current;

    setStatusFor("relight", "loading");

    const timeoutId = window.setTimeout(async () => {
      try {
        const nextRelit = await generateRelightPass(image, {
          lightX: normalizedX,
          lightY: normalizedY,
          intensity: lightIntensity,
        });

        if (jobId !== relightJobRef.current) {
          return;
        }

        startTransition(() => {
          setRelitImage(nextRelit);
          setStatusFor("relight", "done");
        });
      } catch (error) {
        console.error("Relight processing failed:", error);
        if (jobId !== relightJobRef.current) {
          return;
        }
        setIsRelit(false);
        setRelitImage(null);
        setStatusFor("relight", "idle");
      }
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [image, isRelit, lightIntensity, sunPos.x, sunPos.y]);

  const ensureStudioAnalysis = async () => {
    if (!image) return null;
    if (studioAnalysis) {
      setStatuses(["framing", "palette"], "done");
      return studioAnalysis;
    }

    setStatuses(["framing", "palette"], "loading");

    try {
      const analysis = await generateStudioAnalysis(image);
      startTransition(() => {
        setStudioAnalysis(analysis);
        setStatuses(["framing", "palette"], "done");
      });
      return analysis;
    } catch (error) {
      console.error("Studio analysis failed:", error);
      setStatuses(["framing", "palette"], "idle");
      return null;
    }
  };

  const ensureReadabilityAnalysis = async () => {
    if (!image) return null;
    if (readabilityAnalysis) {
      setStatusFor("readability", "done");
      return readabilityAnalysis;
    }

    setStatusFor("readability", "loading");
    try {
      const analysis = await generateReadabilityAnalysis(image);
      startTransition(() => {
        setReadabilityAnalysis(analysis);
        setStatusFor("readability", "done");
      });
      return analysis;
    } catch (error) {
      console.error("Readability analysis failed:", error);
      setStatusFor("readability", "idle");
      return null;
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    replaceImage(URL.createObjectURL(file), true);
  };

  const handleLandingDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    landingDragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    landingDragDepthRef.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      replaceImage(URL.createObjectURL(file), true);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    landingDragDepthRef.current = Math.max(0, landingDragDepthRef.current - 1);
    if (landingDragDepthRef.current === 0) {
      setIsDragging(false);
    }
  };

  const getNormalizedPointInImage = (clientX: number, clientY: number) => {
    const bounds = imageRef.current?.getBoundingClientRect();
    if (!bounds) return null;

    const x = clamp01((clientX - bounds.left) / bounds.width);
    const y = clamp01((clientY - bounds.top) / bounds.height);
    return { x: isMirrored ? 1 - x : x, y };
  };

  const getRegionFromDraft = (draft: RegionDraft): RegionBounds => {
    const x = Math.min(draft.startX, draft.currentX);
    const y = Math.min(draft.startY, draft.currentY);
    const width = Math.abs(draft.currentX - draft.startX);
    const height = Math.abs(draft.currentY - draft.startY);
    return { x, y, width, height };
  };

  const scheduleRegionDraftUpdate = (point: { x: number; y: number }) => {
    pendingRegionPointRef.current = point;
    if (regionFrameRef.current !== null) {
      return;
    }

    regionFrameRef.current = window.requestAnimationFrame(() => {
      regionFrameRef.current = null;
      const pendingPoint = pendingRegionPointRef.current;
      pendingRegionPointRef.current = null;
      if (!pendingPoint) {
        return;
      }

      setRegionDraft((prev) => (prev ? { ...prev, currentX: pendingPoint.x, currentY: pendingPoint.y } : prev));
    });
  };

  const scheduleSunPosUpdate = (nextPos: { x: number; y: number }) => {
    pendingSunPosRef.current = nextPos;
    if (sunFrameRef.current !== null) {
      return;
    }

    sunFrameRef.current = window.requestAnimationFrame(() => {
      sunFrameRef.current = null;
      const pendingPos = pendingSunPosRef.current;
      pendingSunPosRef.current = null;
      if (!pendingPos) {
        return;
      }

      setSunPos(pendingPos);
    });
  };

  const handleRegionPointerDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isSelectingRegion) return;
    const point = getNormalizedPointInImage(e.clientX, e.clientY);
    if (!point) return;
    setRegionDraft({
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  };

  const handleRegionPointerMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!regionDraft) return;
    const point = getNormalizedPointInImage(e.clientX, e.clientY);
    if (!point) return;
    scheduleRegionDraftUpdate(point);
  };

  const handleRegionPointerUp = () => {
    if (!regionDraft) return;
    if (regionFrameRef.current !== null) {
      window.cancelAnimationFrame(regionFrameRef.current);
      regionFrameRef.current = null;
    }

    const pendingPoint = pendingRegionPointRef.current;
    pendingRegionPointRef.current = null;
    const finalDraft = pendingPoint ? { ...regionDraft, currentX: pendingPoint.x, currentY: pendingPoint.y } : regionDraft;
    const nextRegion = getRegionFromDraft(finalDraft);
    setRegionDraft(null);

    if (nextRegion.width < 0.04 || nextRegion.height < 0.04) {
      return;
    }

    setSelectedRegion(nextRegion);
    setLocalPass(null);
    setLocalPassStatus("idle");
    setIsSelectingRegion(false);
  };

  const clearFocusRegion = (keepSelecting = false) => {
    setSelectedRegion(null);
    setRegionDraft(null);
    setLocalPass(null);
    setLocalPassStatus("idle");
    setIsSelectingRegion(keepSelecting);
  };

  const handleFocusRegionToggle = () => {
    if (isSelectingRegion || selectedRegion || regionDraft) {
      clearFocusRegion(false);
      return;
    }

    setLocalPass(null);
    setLocalPassStatus("idle");
    setIsSelectingRegion(true);
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isSelectingRegion || selectedRegion || regionDraft) {
        clearFocusRegion(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isSelectingRegion, regionDraft, selectedRegion]);

  useEffect(() => {
    if (tab !== "critique" || isSelectingRegion || regionDraft) {
      setHoveredMarkIndex(null);
    }
  }, [isSelectingRegion, regionDraft, tab]);

  useEffect(() => {
    const handleStudioShortcuts = (event: KeyboardEvent) => {
      if (!image || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (target?.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        handleFocusRegionToggle();
      } else if (key === "m") {
        event.preventDefault();
        setIsMirrored((prev) => !prev);
      } else if (key === "v") {
        event.preventDefault();
        setIsValueView((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleStudioShortcuts);
    return () => {
      window.removeEventListener("keydown", handleStudioShortcuts);
    };
  }, [image, handleFocusRegionToggle]);

  const runLocalMentorPass = async () => {
    if (!image || !selectedRegion || localPassStatus === "loading") return;
    setLocalPassStatus("loading");
    try {
      const cropUrl = await extractRegionDataUrl(image, selectedRegion);
      const critiquesTask = (async () => {
        const critiques: Critique[] = [];
        const stream = analyzeImageStream(cropUrl);
        for await (const point of stream) {
          if (point && typeof point === "object" && "title" in point) {
            critiques.push(point as Critique);
          }
        }
        return critiques.slice(0, 8);
      })();

      const [readability, relightUrl, critiques] = await Promise.all([
        generateReadabilityAnalysis(cropUrl),
        generateRelightPass(cropUrl, { lightX: 0.1, lightY: -0.2, intensity: 1.85 }),
        critiquesTask,
      ]);

      startTransition(() => {
        setLocalPass({
          cropUrl,
          relightUrl,
          readability,
          critiques,
        });
        setLocalPassStatus("done");
        setIsMentorOpen(true);
      });
    } catch (error) {
      console.error("Local mentor pass failed:", error);
      setLocalPassStatus("idle");
    }
  };

  const handleCanvasDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    canvasDragDepthRef.current += 1;
    setIsCanvasDragging(true);
  };

  const handleCanvasDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsCanvasDragging(true);
  };

  const handleCanvasDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    canvasDragDepthRef.current = Math.max(0, canvasDragDepthRef.current - 1);
    if (canvasDragDepthRef.current === 0) {
      setIsCanvasDragging(false);
    }
  };

  const handleCanvasDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    canvasDragDepthRef.current = 0;
    setIsCanvasDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      replaceImage(URL.createObjectURL(file), true);
    }
  };

  const loadRandomDemo = () => {
    const baseUrl = SKETCH_URLS[Math.floor(Math.random() * SKETCH_URLS.length)];
    const sig = Math.floor(Math.random() * 1000000);
    replaceImage(`${baseUrl}?auto=format&fit=crop&w=1200&q=80&sig=${sig}`);
  };

  const handleCritique = async () => {
    if (!image || toolStatus.critique === "loading") return;
    setStatusFor("critique", "loading");
    critiqueBufferRef.current = [];
    if (critiqueFlushFrameRef.current !== null) {
      window.cancelAnimationFrame(critiqueFlushFrameRef.current);
      critiqueFlushFrameRef.current = null;
    }
    setDisplayedCritiques([]);
    setMasteryScore(null);

    try {
      const stream = analyzeImageStream(image);
      for await (const point of stream) {
        if (point && typeof point === "object" && "title" in point) {
          critiqueBufferRef.current.push(point as Critique);
          flushCritiqueBuffer();
        }
      }
      flushCritiqueBuffer(true);
      startTransition(() => {
        setMasteryScore(Math.floor(Math.random() * 20) + 74);
      });
    } catch (error) {
      console.error("Streaming UI Error:", error);
    } finally {
      flushCritiqueBuffer(true);
      setStatusFor("critique", "done");
    }
  };

  const handleRelightModel = () => {
    setRelitImage(null);
    setSunPos(DEFAULT_SUN_POS);
    setLightIntensity(DEFAULT_LIGHT_INTENSITY);
    setIsRelit(true);
  };

  const handleLayerDeconstruction = async () => {
    if (!image || toolStatus.layers === "loading") return;
    if (layerOverlay && layers.length > 0) {
      setStatusFor("layers", "done");
      return;
    }

    setStatusFor("layers", "loading");
    try {
      const analysis = await generateLayerAnalysis(image);
      startTransition(() => {
        setLayers(analysis.layers);
        setLayerOverlay(analysis.overlayUrl);
        setStatusFor("layers", "done");
      });
    } catch (error) {
      console.error("Layer analysis failed:", error);
      setLayers([]);
      setLayerOverlay(null);
      setStatusFor("layers", "idle");
    }
  };

  const handleFullAudit = async () => {
    if (!image || isAuditing) return;

    setIsAuditing(true);

    const tasks: Promise<unknown>[] = [];

    if (toolStatus.critique !== "loading" && displayedCritiques.length === 0) {
      tasks.push(handleCritique());
    }
    if (!layerOverlay) {
      tasks.push(handleLayerDeconstruction());
    }
    if (!studioAnalysis) {
      tasks.push(ensureStudioAnalysis());
    }
    if (!readabilityAnalysis) {
      tasks.push(ensureReadabilityAnalysis());
    }

    await Promise.allSettled(tasks);
    setIsAuditing(false);
    setIsMentorOpen(true);
  };

  const handleTabChange = async (nextTab: ToolTab) => {
    startTransition(() => {
      setTab(nextTab);
    });
    if ((nextTab === "framing" || nextTab === "palette") && !studioAnalysis && toolStatus[nextTab] === "idle") {
      await ensureStudioAnalysis();
    }
    if (nextTab === "readability" && !readabilityAnalysis && toolStatus.readability === "idle") {
      await ensureReadabilityAnalysis();
    }
  };

  const loadBitmap = async (src: string) => {
    const response = await fetch(src);
    const blob = await response.blob();
    return createImageBitmap(blob);
  };

  const drawCritiqueMarks = (ctx: CanvasRenderingContext2D, critiques: Critique[], width: number, height: number) => {
    const outerRadius = Math.max(10, Math.round(Math.min(width, height) * 0.014));
    const innerRadius = Math.max(4, Math.round(outerRadius * 0.42));
    critiques.forEach((critique) => {
      const x = critique.x * 0.01 * width;
      const y = critique.y * 0.01 * height;

      ctx.save();
      ctx.shadowColor = "rgba(171,39,24,0.3)";
      ctx.shadowBlur = outerRadius * 1.8;
      ctx.fillStyle = "rgba(171,39,24,0.18)";
      ctx.beginPath();
      ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff8f1";
      ctx.strokeStyle = "#a52e1d";
      ctx.lineWidth = Math.max(2, outerRadius * 0.22);
      ctx.beginPath();
      ctx.arc(x, y, innerRadius * 1.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  };

  const drawRegionOverlay = (ctx: CanvasRenderingContext2D, region: RegionBounds, width: number, height: number) => {
    ctx.save();
    ctx.strokeStyle = "#d26f55";
    ctx.lineWidth = Math.max(3, Math.min(width, height) * 0.004);
    ctx.fillStyle = "rgba(214,111,85,0.08)";

    const x = region.x * width;
    const y = region.y * height;
    const boxWidth = region.width * width;
    const boxHeight = region.height * height;

    ctx.beginPath();
    ctx.roundRect(x, y, boxWidth, boxHeight, Math.max(18, Math.min(width, height) * 0.018));
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  const handleExport = async () => {
    const exportSource = tab === "relight" && relitImage ? relitImage : image;
    if (!exportSource) {
      return;
    }

    try {
      const baseBitmap = await loadBitmap(exportSource);
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = baseBitmap.width;
      exportCanvas.height = baseBitmap.height;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.save();
      if (isMirrored) {
        ctx.translate(exportCanvas.width, 0);
        ctx.scale(-1, 1);
      }
      if (isValueView) {
        ctx.filter = "grayscale(1) contrast(1.18) brightness(1.06)";
      }
      ctx.drawImage(baseBitmap, 0, 0, exportCanvas.width, exportCanvas.height);
      ctx.filter = "none";

      if (tab === "layers" && layerOverlay) {
        const overlay = await loadBitmap(layerOverlay);
        ctx.save();
        ctx.globalAlpha = 0.84;
        ctx.globalCompositeOperation = "multiply";
        ctx.drawImage(overlay, 0, 0, exportCanvas.width, exportCanvas.height);
        ctx.restore();
      }

      if (tab === "framing" && studioAnalysis) {
        const heatmap = await loadBitmap(studioAnalysis.heatmapUrl);
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.globalCompositeOperation = "screen";
        ctx.drawImage(heatmap, 0, 0, exportCanvas.width, exportCanvas.height);
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.48)";
        ctx.lineWidth = Math.max(1, Math.min(exportCanvas.width, exportCanvas.height) * 0.0015);
        for (let i = 1; i < 3; i += 1) {
          const verticalX = (exportCanvas.width / 3) * i;
          const horizontalY = (exportCanvas.height / 3) * i;
          ctx.beginPath();
          ctx.moveTo(verticalX, 0);
          ctx.lineTo(verticalX, exportCanvas.height);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, horizontalY);
          ctx.lineTo(exportCanvas.width, horizontalY);
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(255,255,255,0.72)";
        ctx.strokeRect(exportCanvas.width * 0.09, exportCanvas.height * 0.14, exportCanvas.width * 0.82, exportCanvas.height * 0.72);
        ctx.strokeStyle = "rgba(255,255,255,0.52)";
        ctx.strokeRect(exportCanvas.width * 0.23, exportCanvas.height * 0.23, exportCanvas.width * 0.54, exportCanvas.height * 0.54);
        ctx.restore();
      }

      if (tab === "readability" && readabilityAnalysis) {
        const silhouette = await loadBitmap(readabilityAnalysis.silhouetteUrl);
        ctx.save();
        ctx.globalAlpha = 0.66;
        ctx.globalCompositeOperation = "multiply";
        ctx.drawImage(silhouette, 0, 0, exportCanvas.width, exportCanvas.height);
        ctx.restore();
      }

      if (tab === "critique" && displayedCritiques.length > 0) {
        drawCritiqueMarks(ctx, displayedCritiques, exportCanvas.width, exportCanvas.height);
      }

      const region = regionDraft ? getRegionFromDraft(regionDraft) : selectedRegion;
      if (region) {
        drawRegionOverlay(ctx, region, exportCanvas.width, exportCanvas.height);
      }
      ctx.restore();

      if (tab === "palette" && studioAnalysis) {
        const swatchBarHeight = Math.max(44, exportCanvas.height * 0.08);
        const swatchWidth = exportCanvas.width / Math.max(1, studioAnalysis.palette.length);
        ctx.save();
        ctx.fillStyle = "rgba(35,23,18,0.72)";
        ctx.fillRect(0, exportCanvas.height - swatchBarHeight, exportCanvas.width, swatchBarHeight);
        studioAnalysis.palette.forEach((swatch, index) => {
          ctx.fillStyle = swatch.hex;
          ctx.fillRect(index * swatchWidth + 12, exportCanvas.height - swatchBarHeight + 12, swatchWidth - 24, swatchBarHeight - 24);
        });
        ctx.restore();
      }

      const dataUrl = exportCanvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `tryredline-${tab}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  const blurFade = {
    initial: { opacity: 0, filter: "blur(14px)", y: 10 },
    animate: { opacity: 1, filter: "blur(0px)", y: 0 },
    exit: { opacity: 0, filter: "blur(14px)", y: -10 },
    transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] },
  };

  const displayedImage = tab === "relight" && relitImage ? relitImage : image;
  const isFocusSelectionActive = isSelectingRegion || regionDraft !== null;
  const focusRegionLabel = selectedRegion ? "Clear Focus" : isSelectingRegion || regionDraft ? "Cancel Focus" : "Focus";
  const moodTags = getMoodTags(studioAnalysis);
  const visionScore = getVisionScore(masteryScore, studioAnalysis);
  const actionPlan = getActionPlan(studioAnalysis, displayedCritiques, readabilityAnalysis);
  const isSidebarOpen = !isDesktop || isSidebarPinned || isSidebarHovered;
  const activeToolMeta = {
    critique: {
      eyebrow: "Critique",
      title: "Find weak spots",
      description: "Direct notes on focus, value, shape, and story.",
    },
    relight: {
      eyebrow: "Relight",
      title: "Test new lighting",
      description: "Move the key light before repainting it for real.",
    },
    layers: {
      eyebrow: "Layers",
      title: "Sort big shapes",
      description: "See the piece as masses instead of detail.",
    },
    framing: {
      eyebrow: "Framing",
      title: "Check the crop",
      description: "See where the eye lands and where the frame feels tight.",
    },
    palette: {
      eyebrow: "Style DNA",
      title: "Read the palette",
      description: "Pull out the main color story and contrast bias.",
    },
    readability: {
      eyebrow: "Readability",
      title: "Check the read",
      description: "See whether the piece still works at a glance.",
    },
  }[tab];
  const isPortraitImage = displayAspectRatio < 0.9;
  const isTallImage = displayAspectRatio < 0.72;
  const stageSignalChips = [
    selectedRegion ? "Focus region" : activeToolMeta.eyebrow,
    isTallImage ? "Tall fit" : isPortraitImage ? "Portrait fit" : "Full frame",
    tab === "relight" && isRelit ? `Light ${lightIntensity.toFixed(1)}x` : toolStatus[tab] === "done" ? "Ready" : "Idle",
  ];
  const topMetrics = [
    { label: "Overall Read", value: `${visionScore}`, tone: `${toolStatus.critique === "done" || studioAnalysis ? "Live" : "Pending"} Audit` },
    {
      label: "Main Focus",
      value: studioAnalysis ? scoreToPercent(studioAnalysis.creativeDNA.focus) : "--",
      tone: studioAnalysis ? scoreTone(studioAnalysis.creativeDNA.focus) : "Awaiting Scan",
    },
    {
      label: "Visual Balance",
      value: studioAnalysis ? scoreToPercent(studioAnalysis.creativeDNA.balance) : "--",
      tone: studioAnalysis ? scoreTone(studioAnalysis.creativeDNA.balance) : "Awaiting Scan",
    },
    {
      label: "Small-Size Read",
      value: readabilityAnalysis ? scoreToPercent(readabilityAnalysis.metrics.thumbnailRead) : "--",
      tone: readabilityAnalysis ? scoreTone(readabilityAnalysis.metrics.thumbnailRead) : "Awaiting Scan",
    },
  ];

  if (!image) {
    return (
      <div
        className={clsx(
          "fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#fffaf2_0%,#f8eee0_45%,#efe0ce_100%)] px-6 transition-colors duration-500",
          isDragging && "bg-[radial-gradient(circle_at_top,#fff4ef_0%,#f7ddd4_45%,#efcfbf_100%)]",
        )}
        onDragEnter={handleLandingDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleUpload}
          className="hidden"
          accept="image/*"
        />
        <motion.div
          initial={blurFade.initial}
          animate={isDragging ? { opacity: 1, filter: "blur(0px)", y: 0, scale: 1.02 } : { opacity: 1, filter: "blur(0px)", y: 0, scale: 1 }}
          exit={blurFade.exit}
          transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
          className={clsx(
            "relative w-full max-w-[76rem] overflow-hidden rounded-[42px] border border-[#d9c8b3] bg-[#fffaf2]/95 p-5 transition-all duration-500 md:p-7",
            isDragging
              ? "border-[#d38f72] shadow-[0_40px_110px_rgba(186,98,69,0.24)]"
              : "shadow-[0_30px_80px_rgba(92,65,46,0.16)]",
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="pointer-events-none absolute inset-0 opacity-90">
            <motion.div
              initial={{ opacity: 0, x: -40, y: -30, rotate: -7, filter: "blur(18px)" }}
              animate={{ opacity: 1, x: 0, y: 0, rotate: -7, filter: "blur(0px)" }}
              transition={{ duration: 0.8, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="absolute left-8 top-10 hidden h-40 w-40 rounded-[28px] border border-[#e7d6c6] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(246,231,214,0.86))] shadow-[0_18px_44px_rgba(87,66,55,0.08)] md:block"
            />
            <motion.div
              initial={{ opacity: 0, x: 40, y: 28, rotate: 9, filter: "blur(18px)" }}
              animate={{ opacity: 1, x: 0, y: 0, rotate: 9, filter: "blur(0px)" }}
              transition={{ duration: 0.9, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="absolute bottom-12 right-10 hidden h-36 w-44 rounded-[26px] border border-[#e9dcca] bg-[linear-gradient(180deg,rgba(255,252,247,0.88),rgba(241,228,212,0.84))] shadow-[0_18px_44px_rgba(87,66,55,0.07)] lg:block"
            />
          </div>
          <div
            className={clsx(
              "relative overflow-hidden rounded-[34px] border border-dashed border-[#d7c0a8] bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(250,240,225,0.95))] px-6 py-10 text-center transition-all duration-500 md:px-10 md:py-14",
              isDragging && "border-[#cf8161] bg-[linear-gradient(180deg,rgba(255,250,246,0.96),rgba(251,228,214,0.95))]",
            )}
          >
            <div className="pointer-events-none absolute inset-x-10 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.72),rgba(255,255,255,0))]" />
            <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
              {["For painters", "For illustrators", "For WIP reviews"].map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-[#dfc9b6] bg-white/70 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#7b5f50] font-outfit"
                >
                  {label}
                </span>
              ))}
            </div>
            <motion.div
              animate={isDragging ? { scale: 1.08, rotate: -4, y: -8 } : { scale: 1, rotate: 0, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <ImageIcon
                className={clsx(
                  "mx-auto mb-8 transition-colors duration-500",
                  isDragging ? "text-red-600" : "text-[#b99775]",
                )}
                size={70}
                strokeWidth={1.25}
              />
            </motion.div>
            <AnimatePresence>
              {isDragging && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, filter: "blur(12px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 1.04, filter: "blur(12px)" }}
                  className="pointer-events-none absolute inset-5 rounded-[24px] border border-[#df9d81]/80 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.42),rgba(255,255,255,0)_72%)]"
                />
              )}
            </AnimatePresence>
            <div className="mb-3 flex items-end justify-center gap-0.5">
              <span className="shimmer-text inline-block text-6xl font-serif italic leading-none tracking-[-0.04em] md:text-7xl">Red</span>
              <span className="text-6xl font-semibold leading-none tracking-[-0.08em] text-[#231713] md:text-7xl">line</span>
            </div>
            <p className="mx-auto mb-4 max-w-3xl text-lg leading-relaxed text-[#6f5548] italic md:text-[1.35rem]">
              {isDragging
                ? "Drop the artwork to open it in the studio."
                : "Upload a work in progress, check the read, test the light, and decide what to fix next."}
            </p>
            <p className="mx-auto mb-8 max-w-3xl text-sm leading-relaxed text-[#8b6d5a] font-outfit md:text-[0.95rem]">
              Redline is built for artists in the middle of a piece. It helps with critique, readability, lighting, and problem areas without taking over the work.
            </p>
            <div className="mx-auto mb-8 grid max-w-4xl gap-3 md:grid-cols-3">
              {[
                ["Local Mentor", "Box one area and get feedback just for that part of the piece."],
                ["Readability", "Check whether the piece still works small before you keep rendering."],
                ["Quick Checks", "Use Focus, Mirror, and Value View like fast studio habits."],
              ].map(([title, desc]) => (
                <div
                  key={title}
                  className="rounded-[24px] border border-[#e1d0bf] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(247,236,224,0.78))] px-4 py-4 text-left shadow-[0_12px_28px_rgba(87,66,55,0.06)]"
                >
                  <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#9e6b57] font-outfit">{title}</div>
                  <p className="mt-2 text-[13px] leading-relaxed text-[#6a5043]">{desc}</p>
                </div>
              ))}
            </div>
            <div className="mx-auto flex max-w-md flex-col gap-3 sm:flex-row">
              <button className={paperPrimaryButton}>Select Art</button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadRandomDemo();
                }}
                className={paperSecondaryButton}
              >
                Load Demo
              </button>
            </div>
            <p className="mx-auto mt-5 max-w-2xl text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8f6f5b] font-outfit">
              Drop a piece, swap images fast, then press <span className="text-[#a22a1e]">F</span>, <span className="text-[#a22a1e]">M</span>, or <span className="text-[#a22a1e]">V</span>.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,#fffaf4_0%,#f8efe4_36%,#f1e2d3_100%)] text-zinc-800">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUpload}
        className="hidden"
        accept="image/*"
      />

      <div className="mx-auto flex h-full max-w-[1680px] flex-col px-4 pb-5 pt-4 md:px-8 xl:px-10">
        <div className="mb-3 grid shrink-0 gap-2.5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.28fr),repeat(4,minmax(0,0.86fr))]">
          <div className="logo-halo relative overflow-hidden rounded-[22px] border border-[#dfcfbf] bg-[linear-gradient(180deg,rgba(255,253,249,0.94),rgba(248,238,226,0.96))] px-4 py-3 shadow-[0_16px_44px_rgba(87,66,55,0.08)]">
            <div className="flex items-end gap-0.5">
              <span className="shimmer-text inline-block text-[2.35rem] font-serif italic leading-none tracking-[-0.04em] md:text-[2.7rem]">
                Red
              </span>
              <span className="text-[2.35rem] font-semibold leading-none tracking-[-0.08em] text-[#231713] md:text-[2.7rem]">
                line
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2.5">
              <span className="h-px w-7 bg-gradient-to-r from-[#d14a2c] to-transparent" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.32em] text-[#7a6151] font-outfit">
                Local Art Direction
              </span>
            </div>
          </div>
          {topMetrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[18px] border border-[#dfcfbf] bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(248,238,226,0.95))] px-3.5 py-2 shadow-[0_16px_44px_rgba(87,66,55,0.08)]"
            >
              <div className="mb-1 text-[8px] font-semibold uppercase tracking-[0.22em] text-[#9a7862] font-outfit">{metric.label}</div>
              <div className="text-[1.45rem] font-bold italic tracking-tight text-[#241713] font-serif">{metric.value}</div>
              <div className="mt-0.5 text-[11px] text-[#7e6658] font-outfit">{metric.tone}</div>
            </div>
          ))}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <motion.aside
            initial={{ x: -30, opacity: 0, filter: "blur(14px)" }}
            animate={{
              x: 0,
              opacity: 1,
              filter: "blur(0px)",
              width: isDesktop ? (isSidebarOpen ? 368 : 88) : "100%",
            }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={() => setIsSidebarHovered(true)}
            onMouseLeave={() => setIsSidebarHovered(false)}
            className="relative min-h-0 w-full shrink-0 overflow-visible lg:h-full"
          >
            {isDesktop && (
              <div
                className="absolute -left-5 inset-y-0 z-20 w-6"
                onMouseEnter={() => setIsSidebarHovered(true)}
              />
            )}

            <div className="flex h-full min-h-0 overflow-hidden rounded-[32px] border border-[#d8c5b2] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(249,239,226,0.98))] shadow-[0_24px_70px_rgba(88,63,47,0.14)]">
              <div className="flex w-[88px] shrink-0 flex-col items-center justify-between border-r border-[#e6d5c5] bg-[linear-gradient(180deg,rgba(255,250,244,0.98),rgba(246,236,224,0.92))] px-3 py-4">
                <div className="w-full">
	                  <button
	                    onClick={() => setIsSidebarPinned((prev) => !prev)}
	                    className="mb-4 flex w-full flex-col items-center justify-center rounded-[16px] border border-[#dcc8b4] bg-white/75 px-1.5 py-2 text-[#5b4337] shadow-[0_10px_24px_rgba(87,66,55,0.08)] transition hover:-translate-y-0.5 hover:bg-[#fdf5ea]"
	                    title={isSidebarPinned ? "Unpin sidebar" : "Pin sidebar"}
	                  >
	                    <Box size={16} />
	                    <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.18em] font-outfit">
	                      {isSidebarPinned ? "Pinned" : "Pin"}
	                    </span>
	                  </button>

	                  <div className="space-y-2">
                    {toolItems.map((item) => (
	                      <button
	                        key={`rail-${item.id}`}
	                        onClick={() => {
	                          void handleTabChange(item.id);
	                        }}
	                        className={clsx(
	                          "flex w-full flex-col items-center justify-center rounded-[16px] border px-1 py-2 text-[#70584a] transition",
	                          tab === item.id
	                            ? "border-[#2f211a] bg-[#2f211a] text-[#f8efe3]"
	                            : "border-[#dcc8b4] bg-white/68 hover:bg-[#fdf5ea]",
	                        )}
	                        title={item.label}
	                      >
	                        <item.icon size={15} />
	                        <span className="mt-1 text-[7px] font-bold uppercase tracking-[0.16em] font-outfit">
	                          {item.label}
	                        </span>
	                      </button>
	                    ))}
	                  </div>
                </div>

	                <button
	                  onClick={handleExport}
	                  className="flex w-full flex-col items-center justify-center rounded-[16px] border border-[#dcc8b4] bg-white/75 px-1.5 py-2 text-[#5b4337] shadow-[0_10px_24px_rgba(87,66,55,0.08)] transition hover:-translate-y-0.5 hover:bg-[#fdf5ea]"
	                  title="Download PNG"
	                >
	                  <Download size={16} />
	                  <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.18em] font-outfit">Save</span>
	                </button>
              </div>

              <AnimatePresence initial={false}>
                {isSidebarOpen && (
                  <motion.div
                    initial={{ opacity: 0, filter: "blur(14px)", x: -18 }}
                    animate={{ opacity: 1, filter: "blur(0px)", x: 0 }}
                    exit={{ opacity: 0, filter: "blur(14px)", x: -18 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                  >
	              <div className="border-b border-[#e6d5c5] px-6 py-5">
	                <div>
	                  <h1 className="text-3xl font-bold tracking-tighter text-[#241713] italic font-serif">Critique Notes</h1>
	                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.32em] text-[#8f6f5b] font-outfit">Current Piece</p>
	                </div>
	              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="mb-5 rounded-[24px] border border-[#e4d3c3] bg-[linear-gradient(180deg,rgba(251,241,231,0.92),rgba(255,255,255,0.66))] px-4 py-4 shadow-[0_12px_30px_rgba(87,66,55,0.05)]">
                  <button
                    onClick={() => setIsMentorOpen((prev) => !prev)}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#9b735f] font-outfit">Full Pass</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-[#715849]">
                        Run the main checks together and get a clean first read on the piece.
                      </p>
                    </div>
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d9c9bb] bg-white/80 text-[16px] text-[#5a4337]">
                      {isMentorOpen ? "−" : "+"}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isMentorOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0, filter: "blur(12px)" }}
                        animate={{ height: "auto", opacity: 1, filter: "blur(0px)" }}
                        exit={{ height: 0, opacity: 0, filter: "blur(12px)" }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4">
                          <div className="mb-3 flex flex-wrap gap-2">
                            {["Value Groups", "Crop Direction", "Lighting Logic", "Palette Cohesion", "Small-Size Read"].map((item) => (
                              <span
                                key={item}
                                className="rounded-full border border-[#dcc9b6] bg-white/60 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#775d50] font-outfit"
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                          <div className="mb-3 rounded-[18px] border border-[#e2d2c3] bg-white/60 px-4 py-3 text-[12px] leading-relaxed text-[#6e5648]">
                            Start broad, then zoom in where the piece is actually slipping.
                          </div>
                          <button onClick={handleFullAudit} disabled={isAuditing} className={paperPrimaryButton}>
                            {isAuditing ? "Running Full Audit" : "Run Full Audit"}
                          </button>
                          <div className="mt-3">
                            <button
                              onClick={() => setIsPlanOpen((prev) => !prev)}
                              className="flex w-full items-center justify-between gap-3 text-left"
                            >
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8d6c59] font-outfit">Next Pass Plan</div>
                                <div className="mt-1 text-[12px] text-[#7c6253] font-outfit">
                                  {isPlanOpen ? "Clear next steps from the current pass." : "Open for a short fix list."}
                                </div>
                              </div>
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d9c9bb] bg-white/80 text-[16px] text-[#5a4337]">
                                {isPlanOpen ? "−" : "+"}
                              </span>
                            </button>
                            <AnimatePresence initial={false}>
                              {isPlanOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0, filter: "blur(10px)" }}
                                  animate={{ height: "auto", opacity: 1, filter: "blur(0px)" }}
                                  exit={{ height: 0, opacity: 0, filter: "blur(10px)" }}
                                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-4 space-y-2">
                                    {actionPlan.map((item, index) => (
                                      <div key={`${item}-${index}`} className="flex gap-3">
                                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2f211a] text-[9px] font-bold text-[#f8efe3] font-outfit">
                                          {index + 1}
                                        </span>
                                        <p className="text-[13px] leading-relaxed text-[#674f42]">{item}</p>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {selectedRegion && (
                  <div className="mb-5 rounded-[24px] border border-[#e4d3c3] bg-[linear-gradient(180deg,rgba(245,239,255,0.92),rgba(255,255,255,0.72))] px-4 py-4 shadow-[0_12px_30px_rgba(87,66,55,0.05)]">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#8f62a5] font-outfit">Focus Region</div>
                    <p className="text-[13px] leading-relaxed text-[#6f5b7e]">
                      Run feedback just on the boxed area.
                    </p>
                    <div className="mt-4 flex gap-3">
                      <button onClick={runLocalMentorPass} disabled={localPassStatus === "loading"} className={paperPrimaryButton}>
                        {localPassStatus === "loading" ? "Reading Region" : "Analyze Region"}
                      </button>
                    </div>

                    <AnimatePresence initial={false}>
                      {localPassStatus === "loading" && (
                        <motion.div
                          initial={{ opacity: 0, height: 0, filter: "blur(10px)" }}
                          animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }}
                          exit={{ opacity: 0, height: 0, filter: "blur(10px)" }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4">
                            <LoadingCard accent="violet" label="Running Local Mentor Pass" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence initial={false}>
                      {localPass && localPassStatus === "done" && (
                        <motion.div
                          initial={{ opacity: 0, height: 0, filter: "blur(12px)" }}
                          animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }}
                          exit={{ opacity: 0, height: 0, filter: "blur(12px)" }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-[18px] border border-[#e4d3c3] bg-white/75 p-3 shadow-[0_10px_24px_rgba(87,66,55,0.05)]">
                                <img src={localPass.cropUrl} alt="Selected region" className="w-full rounded-[10px] border border-[#eadbca]" />
                                <div className="mt-2 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-[#7a6151] font-outfit">Selected Area</div>
                              </div>
                              <div className="rounded-[18px] border border-[#e4d3c3] bg-white/75 p-3 shadow-[0_10px_24px_rgba(87,66,55,0.05)]">
                                {localPass.relightUrl ? (
                                  <img src={localPass.relightUrl} alt="Regional relight preview" className="w-full rounded-[10px] border border-[#eadbca]" />
                                ) : (
                                  <div className="flex h-full min-h-[120px] items-center justify-center rounded-[10px] border border-[#eadbca] bg-[#faf4ed] text-[11px] text-[#7a6151] font-outfit">
                                    Relight preview unavailable
                                  </div>
                                )}
                                <div className="mt-2 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-[#7a6151] font-outfit">Local Relight</div>
                              </div>
                            </div>

                            {localPass.readability && (
                              <div className="grid grid-cols-2 gap-3">
                                <MetricCard label="Area Read" value={scoreToPercent(localPass.readability.metrics.thumbnailRead)} />
                                <MetricCard label="Shape Read" value={scoreToPercent(localPass.readability.metrics.silhouetteClarity)} />
                              </div>
                            )}

                            <div className="rounded-[20px] border border-[#e4d3c3] bg-white/75 px-4 py-4 shadow-[0_10px_24px_rgba(87,66,55,0.05)]">
                              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#8d6c59] font-outfit">Quick Read</div>
                              <p className="text-[13px] leading-relaxed text-[#684f43]">
                                {localPass.readability && localPass.readability.metrics.thumbnailRead < 0.55
                                  ? "This boxed area is losing clarity when viewed quickly. Simplifying the small shapes here will make the overall image easier to understand."
                                  : "This region is holding together fairly well. The next improvement is less about fixing it and more about pushing emphasis and separation."}
                              </p>
                            </div>

                            <div className="space-y-2">
                              {localPass.critiques.map((critique, index) => (
                                <div key={`${critique.title}-${index}`} className="rounded-[18px] border border-[#eadcf1] bg-white/70 px-4 py-3 shadow-[0_10px_20px_rgba(95,68,123,0.04)]">
                                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8c62b3] font-outfit">Local Note {index + 1}</div>
                                  <div className="mt-1 text-sm font-bold tracking-tight text-[#2e211c] font-serif">{critique.title}</div>
                                  <div className="mt-1 text-[13px] leading-relaxed text-[#674f42]">{critique.desc}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 18, filter: "blur(16px)", scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }}
                    exit={{ opacity: 0, y: -12, filter: "blur(16px)", scale: 0.985 }}
                    transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {tab === "critique" ? (
                      <div className="space-y-5">
                    <p className="text-base leading-relaxed text-[#6a5043] italic">
                      Check focus, value, spacing, and overall read before you keep rendering.
                    </p>

                    {toolStatus.critique !== "done" && displayedCritiques.length === 0 && (
                      <button onClick={handleCritique} disabled={toolStatus.critique === "loading"} className={paperPrimaryButton}>
                        {toolStatus.critique === "loading" ? "Reading Composition" : "Generate Crit Pass"}
                      </button>
                    )}

                    {displayedCritiques.length > 0 && (
                      <motion.div {...blurFade} className="space-y-4">
                        {masteryScore && (
                          <div className="rounded-[22px] border border-[#e7d6c5] bg-white/70 px-4 py-4 shadow-[0_10px_30px_rgba(87,66,55,0.06)]">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <Gauge size={16} className="text-red-700" />
                                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#986a57] font-outfit">Mentor Confidence</span>
                              </div>
                              <span className="text-2xl font-bold text-[#8b2a1c] italic font-serif">{masteryScore}%</span>
                            </div>
                            <p className="text-[13px] leading-relaxed text-[#6f5548]">
                              {getCreativeDirection(studioAnalysis)}
                            </p>
                          </div>
                        )}

                        <div className="space-y-2">
                          {displayedCritiques.map((critique, index) => (
                            <div
                              key={`${critique.title}-${index}`}
                              className="flex cursor-pointer items-center justify-between rounded-[20px] border border-[#e8dbcf] bg-[#fffaf4] px-4 py-3.5 transition hover:-translate-y-0.5 hover:border-[#d7b49b] hover:shadow-[0_10px_24px_rgba(88,63,47,0.08)]"
                              onMouseEnter={() => setHoveredMarkIndex(index)}
                              onMouseLeave={() => setHoveredMarkIndex(null)}
                            >
                              <div>
                                <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.28em] text-[#a07b66] font-outfit">
                                  Mark {index + 1}
                                </span>
                                <span className="text-sm font-bold tracking-tight text-[#2e211c] font-serif">{critique.title}</span>
                              </div>
                              <Search size={14} className="text-[#a07b66]" />
                            </div>
                          ))}
                        </div>

                        {toolStatus.critique === "done" && (
                          <button
                            onClick={() => {
                              setStatusFor("critique", "idle");
                              setDisplayedCritiques([]);
                              setMasteryScore(null);
                            }}
                            className={paperSecondaryButton}
                          >
                            Clear Markings
                          </button>
                        )}
                      </motion.div>
                    )}
                      </div>
                    ) : tab === "relight" ? (
                      <div className="space-y-5">
                    <p className="text-base leading-relaxed text-[#6a5043] italic">
                      Try a new light direction before you repaint it by hand.
                    </p>

                    {!isRelit && toolStatus.relight === "idle" && (
                      <button onClick={handleRelightModel} className={paperPrimaryButton}>
                        Build Lighting Model
                      </button>
                    )}

                    {toolStatus.relight === "loading" && (
                      <LoadingCard accent="amber" label="Solving Light Falloff" />
                    )}

                    {isRelit && (relitImage || toolStatus.relight === "loading" || toolStatus.relight === "done") && (
                      <motion.div {...blurFade} className="space-y-6">
                        <InfoCard
                          accent="amber"
                          title="Relight Active"
                          description="Drag the light to try stronger shadows, highlights, and mood."
                          icon={<Sun size={14} />}
                        />

                        <div className="space-y-4 rounded-[24px] border border-[#e7d6c5] bg-white/65 px-5 py-5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#8e6c58] font-outfit">Intensity</span>
                            <span className="text-base font-bold italic text-[#241713] font-serif">{lightIntensity.toFixed(1)}x</span>
                          </div>
                          <div className="rounded-[18px] border border-[#ecdcc8] bg-[linear-gradient(180deg,rgba(255,248,236,0.86),rgba(255,255,255,0.72))] px-4 py-3 text-[12px] leading-relaxed text-[#6b5244] shadow-[0_8px_20px_rgba(87,66,55,0.05)]">
                            Lower settings stay subtle. Higher settings push the shadows and make the lighting change read faster.
                          </div>
                          <input
                            type="range"
                            min="0.7"
                            max="3.4"
                            step="0.05"
                            value={lightIntensity}
                            onChange={(e) => setLightIntensity(Number.parseFloat(e.target.value))}
                            className="w-full accent-[#7c4c36]"
                          />
                        </div>

                        <button
                          onClick={() => {
                            setIsRelit(false);
                            setRelitImage(null);
                            setSunPos(DEFAULT_SUN_POS);
                            setLightIntensity(DEFAULT_LIGHT_INTENSITY);
                            setStatusFor("relight", "idle");
                          }}
                          className={paperSecondaryButton}
                        >
                          Reset Source
                        </button>
                      </motion.div>
                    )}
                      </div>
                    ) : tab === "layers" ? (
                      <div className="space-y-5">
                    <p className="text-base leading-relaxed text-[#6a5043] italic">
                      Break the piece into larger value and edge masses.
                    </p>

                    {!layers.length && toolStatus.layers === "idle" && (
                      <button onClick={handleLayerDeconstruction} className={paperPrimaryButton}>
                        Run Structural Pass
                      </button>
                    )}

                    {toolStatus.layers === "loading" && <LoadingCard accent="violet" label="Solving Structure Graph" />}

                    {layers.length > 0 && toolStatus.layers === "done" && (
                      <motion.div {...blurFade} className="space-y-5">
                        <InfoCard
                          accent="violet"
                          title="Layer Pass Ready"
                          description="The overlay separates shadow mass, midtones, highlights, and edge density."
                          icon={<Box size={14} />}
                        />

                        <div className="space-y-2">
                          {layers.map((layer) => (
                            <div
                              key={layer.name}
                              className="flex items-center justify-between rounded-[20px] border border-[#e9def1] bg-white/70 px-4 py-4 shadow-[0_10px_22px_rgba(95,68,123,0.05)]"
                            >
                              <div className="flex items-center gap-3">
                                <Layout size={14} className="text-[#9a7ab7]" />
                                <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#3a2a43] font-outfit">{layer.name}</span>
                              </div>
                              <span className="rounded-full bg-[#f3ebfb] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#7e4fad] font-outfit">
                                {Math.round(layer.score * 100)}%
                              </span>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={() => {
                            setLayers([]);
                            setLayerOverlay(null);
                            setStatusFor("layers", "idle");
                          }}
                          className={paperSecondaryButton}
                        >
                          Collapse Layers
                        </button>
                      </motion.div>
                    )}
                      </div>
                    ) : tab === "framing" ? (
                      <div className="space-y-5">
                    <p className="text-base leading-relaxed text-[#6a5043] italic">
                      Check eye flow, balance, and crop pressure.
                    </p>

                    {!studioAnalysis && toolStatus.framing === "idle" && (
                      <button
                        onClick={async () => {
                          await ensureStudioAnalysis();
                        }}
                        className={paperPrimaryButton}
                      >
                        Run Framing Pass
                      </button>
                    )}

                    {toolStatus.framing === "loading" && <LoadingCard accent="rose" label="Mapping Eye Flow" />}

                    {studioAnalysis && toolStatus.framing === "done" && (
                      <motion.div {...blurFade} className="space-y-5">
                        <InfoCard
                          accent="rose"
                          title="Framing Pass Ready"
                          description="Heatmap, crop ideas, and composition notes are ready."
                          icon={<Search size={14} />}
                        />

                        <div className="space-y-3">
                          {studioAnalysis.composition.map((metric) => (
                            <MeterRow key={metric.label} metric={metric} />
                          ))}
                        </div>

                        <div className="space-y-3">
                          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#986a57] font-outfit">Crop Suggestions</div>
                          {studioAnalysis.crops.map((crop) => (
                            <CropCard key={crop.name} crop={crop} />
                          ))}
                        </div>
                      </motion.div>
                    )}
                      </div>
                    ) : tab === "palette" ? (
                      <div className="space-y-5">
                    <p className="text-base leading-relaxed text-[#6a5043] italic">
                      Pull out the main palette and overall color bias.
                    </p>

                    {!studioAnalysis && toolStatus.palette === "idle" && (
                      <button
                        onClick={async () => {
                          await ensureStudioAnalysis();
                        }}
                        className={paperPrimaryButton}
                      >
                        Map Style DNA
                      </button>
                    )}

                    {toolStatus.palette === "loading" && <LoadingCard accent="emerald" label="Extracting Style DNA" />}

                    {studioAnalysis && toolStatus.palette === "done" && (
                      <motion.div {...blurFade} className="space-y-6">
                        <InfoCard
                          accent="emerald"
                          title="Style DNA Ready"
                          description="Main colors, warmth, saturation, and symmetry are mapped out."
                          icon={<Gauge size={14} />}
                        />

                        <div className="space-y-3">
                          {studioAnalysis.palette.map((swatch) => (
                            <div key={swatch.hex} className="flex items-center gap-3 rounded-[20px] border border-[#e3ddcf] bg-white/75 px-4 py-3">
                              <div className="h-10 w-10 rounded-full border border-white/80 shadow-inner" style={{ backgroundColor: swatch.hex }} />
                              <div className="flex-1">
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#3a2a43] font-outfit">{swatch.hex}</div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#efe4d8]">
                                  <div className="h-full rounded-full bg-[#5d4436]" style={{ width: `${Math.max(8, swatch.weight * 100)}%` }} />
                                </div>
                              </div>
                              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e6658] font-outfit">
                                {Math.round(swatch.weight * 100)}%
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <MetricCard label="Contrast" value={scoreToPercent(studioAnalysis.creativeDNA.contrast)} />
                          <MetricCard label="Warmth" value={scoreToPercent(studioAnalysis.creativeDNA.warmth)} />
                          <MetricCard label="Saturation" value={scoreToPercent(studioAnalysis.creativeDNA.saturation)} />
                          <MetricCard label="Symmetry" value={scoreToPercent(studioAnalysis.creativeDNA.symmetry)} />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {moodTags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-[#d7c4af] bg-[#fbf4ea] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6a5043] font-outfit"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </motion.div>
                    )}
                      </div>
                    ) : (
                      <div className="space-y-5">
                    <p className="text-base leading-relaxed text-[#6a5043] italic">
                      Shrink the piece down and see if it still reads quickly.
                    </p>

                    {!readabilityAnalysis && toolStatus.readability === "idle" && (
                      <button
                        onClick={async () => {
                          await ensureReadabilityAnalysis();
                        }}
                        className={paperPrimaryButton}
                      >
                        Run Readability Test
                      </button>
                    )}

                    {toolStatus.readability === "loading" && <LoadingCard accent="amber" label="Compressing Thumbnail Read" />}

                    {readabilityAnalysis && toolStatus.readability === "done" && (
                      <motion.div {...blurFade} className="space-y-5">
                        <InfoCard
                          accent="amber"
                          title="Readability Ready"
                          description="Small-size read, silhouette, and edge clarity are ready to review."
                          icon={<Eye size={14} />}
                        />

                        <div className="rounded-[20px] border border-[#e4d3c3] bg-white/75 px-4 py-4 text-[13px] leading-relaxed text-[#684f43] shadow-[0_10px_24px_rgba(87,66,55,0.05)]">
                          {getReadabilitySummary(readabilityAnalysis)}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <MetricCard label="Small-Size Read" value={scoreToPercent(readabilityAnalysis.metrics.thumbnailRead)} />
                          <MetricCard label="Shape Clarity" value={scoreToPercent(readabilityAnalysis.metrics.silhouetteClarity)} />
                          <MetricCard label="Light/Dark Split" value={scoreToPercent(readabilityAnalysis.metrics.valueSeparation)} />
                          <MetricCard label="Eye Path" value={scoreToPercent(readabilityAnalysis.metrics.glanceHierarchy)} />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-[18px] border border-[#e4d3c3] bg-white/75 p-3 shadow-[0_10px_24px_rgba(87,66,55,0.05)]">
                            <img src={readabilityAnalysis.silhouetteUrl} alt="Silhouette pass" className="w-full rounded-[10px] border border-[#eadbca]" />
                            <div className="mt-2 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-[#7a6151] font-outfit">Silhouette Pass</div>
                            <p className="mt-2 text-[11px] leading-relaxed text-[#6c5345]">
                              Removes detail and color so you can judge whether the main subject still reads as one strong shape.
                            </p>
                          </div>
                          <div className="rounded-[18px] border border-[#e4d3c3] bg-white/75 p-3 shadow-[0_10px_24px_rgba(87,66,55,0.05)]">
                            <img src={readabilityAnalysis.edgeMapUrl} alt="Edge pass" className="w-full rounded-[10px] border border-[#eadbca]" />
                            <div className="mt-2 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-[#7a6151] font-outfit">Edge Pass</div>
                            <p className="mt-2 text-[11px] leading-relaxed text-[#6c5345]">
                              Shows where tiny contrast changes are piling up, which helps spot noisy areas that distract from the focal read.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#986a57] font-outfit">Thumbnail Ladder</div>
                          <div className="grid grid-cols-3 gap-3">
                            {readabilityAnalysis.thumbnails.map((thumbnail) => (
                              <div
                                key={thumbnail.label}
                                className="rounded-[18px] border border-[#e4d3c3] bg-white/75 p-3 text-center shadow-[0_10px_24px_rgba(87,66,55,0.05)]"
                              >
                                <img src={thumbnail.url} alt={thumbnail.label} className="mx-auto rounded-[10px] border border-[#eadbca]" />
                                <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[#7a6151] font-outfit">{thumbnail.label}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="border-t border-[#e6d5c5] bg-[#f7ede1]/80 px-6 py-4">
                <button onClick={() => fileInputRef.current?.click()} className={paperSecondaryButton}>
                  Change Art Piece
                </button>
              </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.aside>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <motion.div
              initial={{ y: -18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.55, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="z-30 mb-3 flex shrink-0 justify-center lg:hidden"
            >
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[#dbc9b5] bg-[#fffaf2]/92 p-2 shadow-[0_18px_44px_rgba(92,65,46,0.12)] backdrop-blur-xl">
                {toolItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      void handleTabChange(item.id);
                    }}
                    className={clsx(
                      "relative flex items-center gap-2 rounded-full px-5 py-3 text-[10px] font-bold uppercase tracking-[0.26em] transition-colors duration-200 font-outfit",
                      tab === item.id
                        ? "text-[#faefe1]"
                        : "text-[#7e6658] hover:text-[#2f211a]",
                    )}
                  >
                    {tab === item.id && (
                      <motion.span
                        layoutId="active-tool-chip"
                        transition={{ type: "spring", stiffness: 340, damping: 30 }}
                        className="absolute inset-0 rounded-full bg-[#2f211a] shadow-[0_10px_24px_rgba(47,33,26,0.24)]"
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      <item.icon size={14} />
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, filter: "blur(16px)", y: 20 }}
              animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="flex min-h-0 flex-1 rounded-[34px] border border-[#ddccb8] bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(247,236,223,0.95))] p-3 shadow-[0_24px_80px_rgba(88,63,47,0.14)] md:p-3.5"
            >
              <div
                ref={canvasRef}
                onDragEnter={handleCanvasDragEnter}
                onDragOver={handleCanvasDragOver}
                onDragLeave={handleCanvasDragLeave}
                onDrop={handleCanvasDrop}
                className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[28px] border border-[#e4d5c5] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.95),rgba(247,235,220,0.96))] px-2 pb-2 pt-2"
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.65),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.2),rgba(114,78,54,0.06))]" />
                <div className="absolute left-3 top-3 z-20 max-w-[calc(100%-1.5rem)]">
                  <div className="group inline-flex flex-col gap-2">
                    <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/70 bg-[rgba(255,251,245,0.86)] px-3 py-2 shadow-[0_12px_28px_rgba(87,66,55,0.08)] backdrop-blur-xl">
                      <span className="text-[9px] font-bold uppercase tracking-[0.26em] text-[#8d6c59] font-outfit">{activeToolMeta.eyebrow}</span>
                      <span className="rounded-full border border-[#e0d1c0] bg-white/75 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.18em] text-[#816756] font-outfit">
                        {toolStatus[tab] === "loading" ? "Working" : toolStatus[tab] === "done" ? "Ready" : "Idle"}
                      </span>
                    </div>
                    <div className="pointer-events-auto max-h-0 overflow-hidden opacity-0 transition-all duration-250 group-hover:max-h-32 group-hover:opacity-100">
                      <div className="w-[18rem] rounded-[18px] border border-white/70 bg-[rgba(255,251,245,0.88)] px-3 py-3 text-[12px] leading-relaxed text-[#6f5548] shadow-[0_12px_28px_rgba(87,66,55,0.08)] backdrop-blur-xl">
                        {activeToolMeta.description}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {stageSignalChips.map((chip) => (
                            <span
                              key={chip}
                              className="rounded-full border border-[#dfcfbf] bg-white/78 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.18em] text-[#735848] font-outfit"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div ref={imageStageRef} className="relative z-10 flex min-h-0 flex-1 items-center justify-center py-2">
                  <div
                    className={clsx(
                      "relative inline-flex max-h-full max-w-full overflow-visible rounded-[22px] border border-[#eadbca] bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(250,243,235,0.94))] p-2 shadow-[0_24px_60px_rgba(84,58,42,0.15)] transition duration-300",
                      isCanvasDragging && "scale-[1.02] border-[#d28a6e] shadow-[0_34px_80px_rgba(186,98,69,0.18)]",
                      isMirrored && "-scale-x-100",
                      isValueView && "grayscale contrast-[1.18] brightness-[1.06]",
                    )}
                    style={{
                      maxWidth: isPortraitImage ? "min(100%, 40rem)" : undefined,
                    }}
                  >
                    <div className="pointer-events-none absolute inset-x-7 top-0 h-10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),rgba(255,255,255,0))]" />
                    <motion.img
                      ref={imageRef}
                      key={displayedImage}
                      {...blurFade}
                      src={displayedImage ?? undefined}
                      alt="WIP Art"
                      onLoad={(event) => {
                        const naturalWidth = event.currentTarget.naturalWidth || event.currentTarget.width || 1;
                        const naturalHeight = event.currentTarget.naturalHeight || event.currentTarget.height || 1;
                        setDisplayAspectRatio(naturalWidth / naturalHeight);
                      }}
                      className={clsx(
                        "block h-auto w-auto rounded-[16px] object-contain",
                        isPortraitImage ? "max-w-full" : "max-w-full lg:max-w-[calc(100vw-320px)] xl:max-w-[calc(100vw-380px)]",
                      )}
                      style={{
                        maxHeight: isTallImage ? "min(56vh, 42rem)" : isPortraitImage ? "min(62vh, 46rem)" : "min(69vh, 48rem)",
                        maxWidth: isPortraitImage ? "min(100%, 38rem)" : undefined,
                      }}
                    />

                    <div
                      className={clsx(
                        "absolute inset-2 z-20 rounded-[14px]",
                        isSelectingRegion || regionDraft ? "pointer-events-auto" : "pointer-events-none",
                      )}
                      onMouseDown={handleRegionPointerDown}
                      onMouseMove={handleRegionPointerMove}
                      onMouseUp={handleRegionPointerUp}
                      onMouseLeave={handleRegionPointerUp}
                    >
                      {(regionDraft || selectedRegion) && (
                        <div
                          className="absolute rounded-[18px] border-2 border-[#d26f55] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.22),rgba(214,111,85,0.08))] shadow-[0_0_0_1px_rgba(255,255,255,0.4),0_18px_36px_rgba(210,111,85,0.18)]"
                          style={(() => {
                            const region = regionDraft ? getRegionFromDraft(regionDraft) : selectedRegion;
                            if (!region) return {};
                            return {
                              left: `${region.x * 100}%`,
                              top: `${region.y * 100}%`,
                              width: `${region.width * 100}%`,
                              height: `${region.height * 100}%`,
                            };
                          })()}
                        />
                      )}
                    </div>

                    <AnimatePresence>
                      {!isFocusSelectionActive && tab === "layers" && toolStatus.layers === "done" && layerOverlay && (
                        <motion.div
                          initial={{ opacity: 0, filter: "blur(16px)" }}
                          animate={{ opacity: 0.84, filter: "blur(0px)" }}
                          exit={{ opacity: 0, filter: "blur(16px)" }}
                          className="absolute inset-2 overflow-hidden rounded-[14px]"
                        >
                          <img
                            src={layerOverlay}
                            alt="Layer analysis overlay"
                            className="h-full w-full object-contain opacity-95 mix-blend-multiply"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {!isFocusSelectionActive && tab === "framing" && studioAnalysis && toolStatus.framing === "done" && (
                        <motion.div
                          initial={{ opacity: 0, filter: "blur(16px)" }}
                          animate={{ opacity: 1, filter: "blur(0px)" }}
                          exit={{ opacity: 0, filter: "blur(16px)" }}
                          className="absolute inset-2 overflow-hidden rounded-[14px]"
                        >
                          <img
                            src={studioAnalysis.heatmapUrl}
                            alt="Framing heatmap overlay"
                            className="h-full w-full object-contain opacity-55 mix-blend-screen"
                          />
                          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-55">
                            {Array.from({ length: 9 }).map((_, index) => (
                              <div key={index} className="border border-white/50" />
                            ))}
                          </div>
                          <div className="absolute left-1/2 top-1/2 h-[72%] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-white/70" />
                          <div className="absolute left-1/2 top-1/2 h-[54%] w-[54%] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-white/50" />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {!isFocusSelectionActive && tab === "palette" && studioAnalysis && toolStatus.palette === "done" && (
                        <motion.div
                          initial={{ opacity: 0, y: 18 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 18 }}
                          className="absolute bottom-6 left-6 right-6 flex gap-2 rounded-[18px] border border-white/60 bg-[rgba(35,23,18,0.54)] p-3 backdrop-blur-xl"
                        >
                          {studioAnalysis.palette.map((swatch) => (
                            <div key={swatch.hex} className="min-w-0 flex-1">
                              <div className="h-10 rounded-[10px] border border-white/20" style={{ backgroundColor: swatch.hex }} />
                              <div className="mt-2 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-white/90 font-outfit">
                                {swatch.hex.replace("#", "")}
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {!isFocusSelectionActive && tab === "readability" && readabilityAnalysis && toolStatus.readability === "done" && (
                        <>
                          <motion.div
                            initial={{ opacity: 0, filter: "blur(16px)" }}
                            animate={{ opacity: 0.66, filter: "blur(0px)" }}
                            exit={{ opacity: 0, filter: "blur(16px)" }}
                            className="absolute inset-2 overflow-hidden rounded-[14px]"
                          >
                            <img
                              src={readabilityAnalysis.silhouetteUrl}
                              alt="Silhouette readability overlay"
                              className="h-full w-full object-contain mix-blend-multiply"
                            />
                          </motion.div>
                          <motion.div
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 18 }}
                            className="absolute bottom-5 left-5 flex gap-2 rounded-[18px] border border-white/60 bg-[rgba(35,23,18,0.64)] p-3 backdrop-blur-xl"
                          >
                            {readabilityAnalysis.thumbnails.map((thumbnail) => (
                              <div key={thumbnail.label} className="w-[72px]">
                                <img src={thumbnail.url} alt={thumbnail.label} className="w-full rounded-[10px] border border-white/20" />
                                <div className="mt-1 text-center text-[8px] font-bold uppercase tracking-[0.18em] text-white/85 font-outfit">
                                  {thumbnail.label}
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>

                    <div className="pointer-events-none absolute inset-2 overflow-visible rounded-[14px]">
                      <AnimatePresence>
                        {!isFocusSelectionActive &&
                          tab === "critique" &&
                          displayedCritiques.map((dot, index) => (
                            <RedlineMark
                              key={`${image}-${index}`}
                              dot={dot}
                              index={index}
                              forceHover={hoveredMarkIndex === index}
                            />
                          ))}
                      </AnimatePresence>
                    </div>
                  </div>

                  <AnimatePresence>
                    {!isFocusSelectionActive && tab === "relight" && isRelit && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.7, filter: "blur(10px)" }}
                        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                        exit={{ opacity: 0, scale: 0.7, filter: "blur(10px)" }}
                        drag
                        dragConstraints={imageStageRef}
                        dragElastic={0}
                        dragMomentum={false}
                        onDrag={(_, info) => scheduleSunPosUpdate({ x: info.offset.x, y: info.offset.y })}
                        className="absolute left-1/2 top-1/2 z-20 -ml-6 -mt-6 flex h-12 w-12 cursor-grab items-center justify-center rounded-full border border-[#e6c98f] bg-[radial-gradient(circle,#fff6ce_0%,#f4d978_58%,#deb24b_100%)] shadow-[0_0_0_6px_rgba(255,248,220,0.7),0_18px_34px_rgba(176,128,28,0.24)] active:cursor-grabbing"
                      >
                        <Sun className="text-[#7b5200]" size={18} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="relative z-20 mx-auto grid w-full max-w-[16.5rem] shrink-0 grid-cols-3 gap-1.5 rounded-[22px] border border-white/60 bg-[rgba(255,251,245,0.62)] p-1.5 shadow-[0_14px_28px_rgba(87,66,55,0.1)] opacity-85 backdrop-blur-xl transition hover:opacity-100 md:max-w-[18rem]">
                  <button
                    onClick={handleFocusRegionToggle}
                    className={clsx(
                      "rounded-[16px] border px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] backdrop-blur-xl transition font-outfit",
                      isSelectingRegion || selectedRegion || regionDraft
                        ? "border-[#2f211a] bg-[#2f211a] text-[#f8efe3]"
                        : "border-[#d9c8b7] bg-white/70 text-[#6f5648] hover:bg-[#fbf2e7]",
                    )}
                  >
                    {focusRegionLabel}
                    <span className="ml-1 hidden text-[9px] opacity-70 md:inline">F</span>
                  </button>
                  <button
                    onClick={() => setIsMirrored((prev) => !prev)}
                    className={clsx(
                      "rounded-[16px] border px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] backdrop-blur-xl transition font-outfit",
                      isMirrored
                        ? "border-[#2f211a] bg-[#2f211a] text-[#f8efe3]"
                        : "border-[#d9c8b7] bg-white/70 text-[#6f5648] hover:bg-[#fbf2e7]",
                    )}
                  >
                    Mirror
                    <span className="ml-1 hidden text-[9px] opacity-70 md:inline">M</span>
                  </button>
                  <button
                    onClick={() => setIsValueView((prev) => !prev)}
                    className={clsx(
                      "rounded-[16px] border px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] backdrop-blur-xl transition font-outfit",
                      isValueView
                        ? "border-[#2f211a] bg-[#2f211a] text-[#f8efe3]"
                        : "border-[#d9c8b7] bg-white/70 text-[#6f5648] hover:bg-[#fbf2e7]",
                    )}
                  >
                    Values
                    <span className="ml-1 hidden text-[9px] opacity-70 md:inline">V</span>
                  </button>
                </div>

                <AnimatePresence>
                  {isCanvasDragging && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98, filter: "blur(12px)" }}
                      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, scale: 1.02, filter: "blur(12px)" }}
                      className="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-[24px] border border-dashed border-[#cf8161] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.55),rgba(255,236,226,0.34),rgba(255,255,255,0.08))]"
                    >
                      <div className="rounded-[20px] border border-white/60 bg-white/65 px-5 py-5 text-center shadow-[0_18px_40px_rgba(186,98,69,0.16)] backdrop-blur-xl">
                        <ImageIcon className="mx-auto text-[#b55f43]" size={32} strokeWidth={1.4} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </section>
        </div>
      </div>
    </div>
  );
}

const LoadingCard = memo(function LoadingCard({
  accent,
  label,
}: {
  accent: "amber" | "blue" | "violet" | "rose" | "emerald";
  label: string;
}) {
  const theme = {
    amber: "border-[#ead7b7] bg-[#fff7df]/80 text-[#9c7c58] border-t-[#c38b29]",
    blue: "border-[#d6e3f2] bg-[#f5f9ff] text-[#6c8099] border-t-[#4c7cb0]",
    violet: "border-[#e3d7ef] bg-[#faf5ff] text-[#886c9f] border-t-[#8f57c1]",
    rose: "border-[#ecd8d5] bg-[#fff5f4] text-[#a06a63] border-t-[#d26d5f]",
    emerald: "border-[#d6eadb] bg-[#f1fcf2] text-[#68866d] border-t-[#4f9a61]",
  }[accent];

  return (
    <div className={`flex flex-col items-center gap-5 rounded-[24px] border px-5 py-12 text-center ${theme}`}>
      <div className={`h-10 w-10 animate-spin rounded-full border-[3px] border-white/50 ${theme.split(" ").find((token) => token.startsWith("border-t-")) ?? ""}`} />
      <span className="text-[10px] font-bold uppercase tracking-[0.38em] font-outfit">{label}</span>
    </div>
  );
});

function InfoCard({
  accent,
  title,
  description,
  icon,
}: {
  accent: "amber" | "blue" | "violet" | "rose" | "emerald";
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  const theme = {
    amber: "border-[#ead7b7] bg-[#fff8e9] text-[#a97d1f] body-[#6f5548]",
    blue: "border-[#d4e3f1] bg-[#f5f9ff] text-[#54789c] body-[#5d6874]",
    violet: "border-[#e3d7ef] bg-[#fbf6ff] text-[#8658b4] body-[#6f5b7e]",
    rose: "border-[#ecd8d5] bg-[#fff5f4] text-[#a9635a] body-[#75574f]",
    emerald: "border-[#d4ead8] bg-[#f2fbf2] text-[#4f8d5d] body-[#5e7563]",
  }[accent];

  const bodyColor = theme.match(/body-\[(#[^\]]+)\]/)?.[1] ?? "#6f5548";

  return (
    <div className={`rounded-[24px] border px-5 py-5 text-center ${theme.replace(/body-\[[^\]]+\]/, "")}`}>
      <p className="mb-2 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] font-outfit">
        {icon} {title}
      </p>
      <p className="text-sm leading-relaxed italic" style={{ color: bodyColor }}>
        {description}
      </p>
    </div>
  );
}

const MetricCard = memo(function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[#e6d6c4] bg-white/75 px-4 py-4 text-center shadow-[0_10px_24px_rgba(87,66,55,0.06)]">
      <span className="mb-2 block text-[9px] font-bold uppercase tracking-[0.26em] text-[#9b7a66] font-outfit">{label}</span>
      <span className="text-2xl font-bold italic text-[#241713] font-serif">{value}</span>
    </div>
  );
});

const MeterRow = memo(function MeterRow({ metric }: { metric: CompositionMetric }) {
  return (
    <div className="rounded-[20px] border border-[#e3d8cc] bg-white/70 px-4 py-4 shadow-[0_10px_22px_rgba(95,68,123,0.04)]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#3a2a43] font-outfit">{metric.label}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8d6d58] font-outfit">{scoreToPercent(metric.score)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#efe4d8]">
        <div className="h-full rounded-full bg-[#8c5842]" style={{ width: `${Math.max(8, metric.score * 100)}%` }} />
      </div>
    </div>
  );
});

const CropCard = memo(function CropCard({ crop }: { crop: CropSuggestion }) {
  return (
    <div className="rounded-[20px] border border-[#e3d8cc] bg-white/75 px-4 py-4 shadow-[0_10px_22px_rgba(95,68,123,0.04)]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#3a2a43] font-outfit">{crop.name}</span>
        <span className="rounded-full bg-[#f3ebfb] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#7e4fad] font-outfit">
          {scoreToPercent(crop.score)}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-[#6f5548]">{crop.desc}</p>
    </div>
  );
});

const RedlineMark = memo(function RedlineMark({ dot, index, forceHover }: { dot: Critique; index: number; forceHover: boolean }) {
  const [isHoveredLocal, setIsHoveredLocal] = useState(false);

  const isHovered = isHoveredLocal || forceHover;
  const isNearRight = dot.x > 70;
  const isNearLeft = dot.x < 30;
  const isNearTop = dot.y < 30;
  const xPositionClass = isNearRight ? "right-0 translate-x-4" : isNearLeft ? "left-0 -translate-x-4" : "left-1/2 -translate-x-1/2";
  const yPositionClass = isNearTop ? "top-12" : "bottom-12";
  const initialY = isNearTop ? -10 : 10;

  return (
    <motion.div
      initial={{ opacity: 0, filter: "blur(10px)", scale: 0 }}
      animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className={clsx("absolute pointer-events-none", isHovered ? "z-[999]" : "z-20")}
      style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
    >
      <div
        className="group pointer-events-auto relative flex cursor-pointer items-center justify-center"
        onMouseEnter={() => setIsHoveredLocal(true)}
        onMouseLeave={() => setIsHoveredLocal(false)}
      >
        <div className="flex h-9 w-9 items-center justify-center">
          <div className={clsx("absolute inset-0 rounded-full bg-red-700/25", isHovered ? "scale-150 opacity-30" : "animate-ping opacity-45")} />
          <div className={clsx("h-4 w-4 rounded-full border-[3px] border-red-700 bg-[#fff8f1] shadow-[0_0_18px_rgba(171,39,24,0.45)]", isHovered ? "scale-125" : "group-hover:scale-110")} />
        </div>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: initialY * 1.8, scale: 0.84 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: initialY * 1.8, scale: 0.88 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className={clsx("pointer-events-none absolute w-64", xPositionClass, yPositionClass)}
          >
            <div className="pointer-events-none absolute inset-[-7px] rounded-[28px] bg-[radial-gradient(circle_at_center,rgba(255,234,222,0.9),rgba(255,234,222,0.34)_48%,rgba(255,234,222,0)_76%)] opacity-65 blur-md" />
            <div className="relative overflow-hidden rounded-[24px] border border-[#e0cdbd] bg-[linear-gradient(180deg,rgba(255,250,242,0.98),rgba(248,236,221,0.96))] p-5 shadow-[0_28px_60px_rgba(87,66,55,0.18)]">
              <div style={{ transform: `rotate(${(index % 2 === 0 ? 1 : -1) * 1.1}deg)` }}>
                <h4 className="mb-2 text-[9px] font-bold uppercase tracking-[0.26em] text-[#a53e25] font-outfit">Director&apos;s Note</h4>
                <p className="text-sm leading-snug text-[#2b211d] italic font-serif">{dot.desc}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.index === nextProps.index &&
    prevProps.forceHover === nextProps.forceHover &&
    prevProps.dot.x === nextProps.dot.x &&
    prevProps.dot.y === nextProps.dot.y &&
    prevProps.dot.title === nextProps.dot.title &&
    prevProps.dot.desc === nextProps.dot.desc
  );
});
