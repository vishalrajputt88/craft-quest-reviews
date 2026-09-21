/**
 * Admin-side live preview. Mirrors the storefront renderer (same maths), so
 * what the merchant tunes here is exactly what customers see.
 */
import { useEffect, useRef, useState } from "react";

export type PreviewStyle = {
  mode: "PNG" | "CSS";
  overlayUrl?: string | null;
  sliceTop: number; sliceRight: number; sliceBottom: number; sliceLeft: number;
  face: string; edge: string; inner: string;
  thickness: number;
  matEnabled: boolean; matColor: string; matWidth: number;
};

const ART =
  "linear-gradient(160deg,#c9b79c 0%,#a88a63 30%,#7e6448 55%,#d8c4a4 80%,#efe3cf 100%)";

export function FramePreview({
  style, ratio = "2 / 3", height = 360, showGuides = false,
}: { style: PreviewStyle; ratio?: string; height?: number; showGuides?: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(20);

  // Moulding width in px = thickness % of the frame's short side, recomputed
  // on resize so the frame keeps its proportions at any preview size.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setPx(Math.max(4, Math.round(Math.min(r.width, r.height) * (style.thickness / 100))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [style.thickness]);

  const usePng = style.mode === "PNG" && style.overlayUrl;

  const frameCss: React.CSSProperties = usePng
    ? {
        borderStyle: "solid",
        borderWidth: px,
        borderImageSource: `url("${style.overlayUrl}")`,
        borderImageSlice: `${style.sliceTop}% ${style.sliceRight}% ${style.sliceBottom}% ${style.sliceLeft}%`,
        borderImageRepeat: "stretch",
      }
    : {
        padding: px,
        background: style.face,
        boxShadow: `inset 0 0 0 1px ${style.edge}, inset 2px 2px 4px rgba(255,255,255,.18), inset -2px -2px 5px rgba(0,0,0,.35)`,
        borderRadius: 3,
      };

  const matPad = style.matEnabled ? Math.round(px * (style.matWidth / Math.max(style.thickness, 1))) : 0;

  return (
    <div style={{ display: "grid", placeItems: "center", height, padding: 24, borderRadius: 12, background: "linear-gradient(180deg,#efe9e0,#e0d7ca)" }}>
      <div
        ref={boxRef}
        style={{
          position: "relative", height: "100%", aspectRatio: ratio, boxSizing: "border-box",
          filter: "drop-shadow(4px 10px 14px rgba(60,44,24,.28))",
          ...frameCss,
        }}
      >
        <div style={{
          width: "100%", height: "100%", boxSizing: "border-box",
          padding: matPad,
          background: style.matEnabled ? style.matColor : "transparent",
          boxShadow: style.matEnabled ? "inset 3px 3px 7px rgba(0,0,0,.12)" : "none",
        }}>
          <div style={{ width: "100%", height: "100%", background: ART, position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(118deg,rgba(255,255,255,.28),rgba(255,255,255,0) 46%)" }} />
          </div>
        </div>

        {showGuides && usePng && (
          // Slice guides: dashed lines where the PNG is cut into corners/edges
          <div style={{ position: "absolute", inset: -px, pointerEvents: "none" }}>
            {[
              { top: `${style.sliceTop}%`, left: 0, right: 0, height: 0, borderTop: "1px dashed #e0245e" },
              { bottom: `${style.sliceBottom}%`, left: 0, right: 0, height: 0, borderTop: "1px dashed #e0245e" },
              { left: `${style.sliceLeft}%`, top: 0, bottom: 0, width: 0, borderLeft: "1px dashed #e0245e" },
              { right: `${style.sliceRight}%`, top: 0, bottom: 0, width: 0, borderLeft: "1px dashed #e0245e" },
            ].map((g, i) => <div key={i} style={{ position: "absolute", ...g } as React.CSSProperties} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Shows the raw PNG with the slice lines, so insets can be set by eye. */
export function SliceGuide({ url, slice }: { url: string; slice: [number, number, number, number] }) {
  const [t, r, b, l] = slice;
  return (
    <div style={{ position: "relative", display: "inline-block", maxWidth: "100%", background: "repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 16px 16px", borderRadius: 8 }}>
      <img src={url} alt="" style={{ display: "block", maxWidth: "100%", maxHeight: 280 }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: `${t}%`, borderTop: "1px dashed #e0245e" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: `${b}%`, borderTop: "1px dashed #e0245e" }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${l}%`, borderLeft: "1px dashed #e0245e" }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, right: `${r}%`, borderLeft: "1px dashed #e0245e" }} />
    </div>
  );
}
