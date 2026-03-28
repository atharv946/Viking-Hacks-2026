import { PenTool } from "lucide-react";

export function Navbar() {
  return (
    <nav className="h-16 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl flex items-center justify-between px-6 z-50 relative">
      <div className="flex items-center gap-3">
        <div className="bg-red-500/10 p-2 rounded-lg border border-red-500/20 text-red-500">
          <PenTool size={20} className="fill-red-500/20" />
        </div>
        <span className="text-xl font-semibold tracking-tight text-zinc-100">
          Redline
        </span>
      </div>
      <div className="text-sm font-medium text-zinc-500 uppercase tracking-widest">
        Professional critique. Zero ego.
      </div>
    </nav>
  );
}
