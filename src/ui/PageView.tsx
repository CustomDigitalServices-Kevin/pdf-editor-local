import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { PdfDoc } from "../engines/pdf/render";
import { renderPage } from "../engines/pdf/render";
import type { Annotation, PageEntry, LineAnnot, InkAnnot, ImageAnnot } from "../core/types";
import type { Style, ToolId } from "../state/defaults";
import {
  RECT_TOOLS,
  createInkAnnotation,
  createLineTool,
  createRectTool,
  createTextAnnotation,
  createImageAnnotation,
} from "../state/defaults";
import {
  annotationRect,
  rectFromDrag,
  resizeAnnotation,
  translateAnnotation,
} from "../state/geometry";

export type PendingImage = {
  type: "image" | "signature";
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
};

type Props = {
  pdfDoc: PdfDoc | null;
  entry: PageEntry;
  pageIndex: number; // final index
  scale: number;
  annotations: Annotation[];
  selectedId: string | null;
  tool: ToolId;
  style: Style;
  pendingImage: PendingImage | null;
  onCreate: (a: Annotation) => void;
  onUpdate: (id: string, next: Annotation) => void;
  onSelect: (id: string | null) => void;
};

type Drag =
  | { mode: "create-rect"; x0: number; y0: number; x1: number; y1: number }
  | { mode: "create-line"; x0: number; y0: number; x1: number; y1: number }
  | { mode: "create-ink"; points: Array<[number, number]> }
  | {
      mode: "move";
      id: string;
      orig: Annotation;
      startVx: number;
      startVy: number;
    }
  | {
      mode: "resize";
      id: string;
      orig: Annotation;
      startVx: number;
      startVy: number;
    };

export function PageView(props: Props) {
  const { pdfDoc, entry, pageIndex, scale, annotations, selectedId, tool, style } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);

  // Render the page (or a white blank) whenever inputs change.
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const src = entry.source;
    if (src.kind === "blank") {
      const w = Math.floor(src.width * scale);
      const h = Math.floor(src.height * scale);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }
      setSize({ w, h });
      return;
    }
    if (src.kind === "original" && pdfDoc) {
      renderPage(pdfDoc, src.index + 1, canvas, scale, entry.rotation)
        .then((s) => {
          if (!cancelled) setSize({ w: s.widthPx, h: s.heightPx });
        })
        .catch(() => {
          /* render failure leaves the previous frame; the page just stays blank */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, entry.source, entry.rotation, scale]);

  const toView = (clientX: number, clientY: number): { vx: number; vy: number } => {
    const rect = overlayRef.current?.getBoundingClientRect();
    const px = clientX - (rect?.left ?? 0);
    const py = clientY - (rect?.top ?? 0);
    return { vx: px / scale, vy: py / scale };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const { vx, vy } = toView(e.clientX, e.clientY);
    overlayRef.current?.setPointerCapture(e.pointerId);

    if (tool === "select") {
      props.onSelect(null);
      return;
    }
    if (tool === "text") {
      props.onCreate(createTextAnnotation(pageIndex, vx, vy, style));
      return;
    }
    if (tool === "line" || tool === "arrow") {
      setDrag({ mode: "create-line", x0: vx, y0: vy, x1: vx, y1: vy });
      return;
    }
    if (tool === "ink") {
      setDrag({ mode: "create-ink", points: [[vx, vy]] });
      return;
    }
    // rect tools + image/signature
    setDrag({ mode: "create-rect", x0: vx, y0: vy, x1: vx, y1: vy });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { vx, vy } = toView(e.clientX, e.clientY);
    if (drag.mode === "create-rect" || drag.mode === "create-line") {
      setDrag({ ...drag, x1: vx, y1: vy });
    } else if (drag.mode === "create-ink") {
      setDrag({ mode: "create-ink", points: [...drag.points, [vx, vy]] });
    } else if (drag.mode === "move") {
      props.onUpdate(drag.id, translateAnnotation(drag.orig, vx - drag.startVx, vy - drag.startVy));
    } else {
      const base = annotationRect(drag.orig);
      if (base) {
        const r = rectFromDrag(base.x, base.y, vx, vy);
        props.onUpdate(drag.id, resizeAnnotation(drag.orig, r));
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    overlayRef.current?.releasePointerCapture(e.pointerId);
    if (!drag) return;
    if (drag.mode === "create-rect") {
      const r = rectFromDrag(drag.x0, drag.y0, drag.x1, drag.y1);
      if (r.w >= 3 && r.h >= 3) {
        if ((tool === "image" || tool === "signature") && props.pendingImage) {
          props.onCreate(
            createImageAnnotation(
              props.pendingImage.type,
              pageIndex,
              r,
              props.pendingImage.bytes,
              props.pendingImage.mime,
            ),
          );
        } else if (RECT_TOOLS.includes(tool)) {
          props.onCreate(createRectTool(tool, pageIndex, r, style));
        }
      }
    } else if (drag.mode === "create-line" && (tool === "line" || tool === "arrow")) {
      props.onCreate(createLineTool(tool, pageIndex, drag.x0, drag.y0, drag.x1, drag.y1, style));
    } else if (drag.mode === "create-ink" && drag.points.length >= 2) {
      props.onCreate(createInkAnnotation(pageIndex, drag.points, style));
    }
    setDrag(null);
  };

  const startMove = (e: React.PointerEvent, a: Annotation) => {
    if (tool !== "select") return;
    e.stopPropagation();
    overlayRef.current?.setPointerCapture(e.pointerId);
    const { vx, vy } = toView(e.clientX, e.clientY);
    props.onSelect(a.id);
    setDrag({ mode: "move", id: a.id, orig: a, startVx: vx, startVy: vy });
  };

  const startResize = (e: React.PointerEvent, a: Annotation) => {
    e.stopPropagation();
    overlayRef.current?.setPointerCapture(e.pointerId);
    const { vx, vy } = toView(e.clientX, e.clientY);
    setDrag({ mode: "resize", id: a.id, orig: a, startVx: vx, startVy: vy });
  };

  return (
    <div className="page-view">
      <canvas ref={canvasRef} className="page-canvas" />
      <div
        ref={overlayRef}
        className="page-overlay"
        style={{ width: size.w, height: size.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        data-testid={`overlay-${pageIndex}`}
      >
        <svg className="vector-layer" width={size.w} height={size.h}>
          {annotations.map((a) =>
            a.type === "line" || a.type === "arrow" ? (
              <VectorLine
                key={a.id}
                a={a}
                scale={scale}
                selected={a.id === selectedId}
                onSelect={(e) => {
                  startMove(e, a);
                }}
              />
            ) : a.type === "ink" ? (
              <VectorInk
                key={a.id}
                a={a}
                scale={scale}
                selected={a.id === selectedId}
                onSelect={(e) => {
                  startMove(e, a);
                }}
              />
            ) : null,
          )}
          <DraftVector drag={drag} scale={scale} />
        </svg>
        {annotations.map((a) => {
          const rect = annotationRect(a);
          if (!rect) return null;
          return (
            <BoxAnnot
              key={a.id}
              a={a}
              rect={rect}
              scale={scale}
              selected={a.id === selectedId}
              onMove={(e) => {
                startMove(e, a);
              }}
              onResize={(e) => {
                startResize(e, a);
              }}
            />
          );
        })}
        <DraftRect drag={drag} scale={scale} tool={tool} />
      </div>
    </div>
  );
}

function rgbCss(c: { r: number; g: number; b: number }): string {
  return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
}

function BoxAnnot(props: {
  a: Annotation;
  rect: { x: number; y: number; w: number; h: number };
  scale: number;
  selected: boolean;
  onMove: (e: React.PointerEvent) => void;
  onResize: (e: React.PointerEvent) => void;
}) {
  const { a, rect, scale, selected } = props;
  const style: React.CSSProperties = {
    position: "absolute",
    left: rect.x * scale,
    top: rect.y * scale,
    width: rect.w * scale,
    height: rect.h * scale,
    boxSizing: "border-box",
    cursor: "move",
    outline: selected ? "1px solid #2563eb" : "none",
  };

  let inner: React.ReactNode = null;
  if (a.type === "rect" || a.type === "ellipse") {
    style.border = a.stroke ? `${a.strokeWidth}px solid ${rgbCss(a.stroke)}` : "none";
    style.background = a.fill ? rgbCss(a.fill) : "transparent";
    style.opacity = a.opacity;
    if (a.type === "ellipse") style.borderRadius = "50%";
  } else if (a.type === "highlight") {
    style.background = rgbCss(a.color);
    style.opacity = 0.4;
  } else if (a.type === "whiteout") {
    style.background = "#ffffff";
  } else if (a.type === "underline" || a.type === "strike") {
    const line: React.CSSProperties = {
      position: "absolute",
      left: 0,
      right: 0,
      height: 2,
      background: rgbCss(a.color),
      top: a.type === "underline" ? "92%" : "50%",
    };
    inner = <div style={line} />;
  } else if (a.type === "link") {
    style.border = "1px dashed #2563eb";
    style.background = "rgba(37,99,235,0.06)";
  } else if (a.type === "text") {
    style.color = rgbCss(a.color);
    style.fontFamily = a.fontFamily.startsWith("Times")
      ? "serif"
      : a.fontFamily.startsWith("Courier")
        ? "monospace"
        : "sans-serif";
    style.fontSize = a.fontSize * scale;
    style.lineHeight = 1.15;
    style.textAlign = a.align;
    style.overflow = "hidden";
    style.whiteSpace = "pre-wrap";
    inner = a.text;
  } else if (a.type === "image" || a.type === "signature") {
    inner = <ImageAnnotImg a={a} />;
  }

  return (
    <div style={style} onPointerDown={props.onMove} data-annot={a.id}>
      {inner}
      {selected && annotationResizable(a) && (
        <div
          onPointerDown={props.onResize}
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            background: "#2563eb",
            borderRadius: 2,
            cursor: "nwse-resize",
          }}
          data-resize={a.id}
        />
      )}
    </div>
  );
}

function annotationResizable(a: Annotation): boolean {
  return a.type !== "underline" && a.type !== "strike";
}

function ImageAnnotImg({ a }: { a: ImageAnnot }) {
  const url = useMemo(
    () => URL.createObjectURL(new Blob([a.bytes.slice()], { type: a.mime })),
    // bytes/mime are fixed for a given annotation id; keying on id avoids
    // rebuilding the object URL on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a.id],
  );
  useEffect(
    () => () => {
      URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <img
      src={url}
      alt=""
      style={{
        width: "100%",
        height: "100%",
        objectFit: "fill",
        pointerEvents: "none",
      }}
    />
  );
}

function VectorLine(props: {
  a: LineAnnot;
  scale: number;
  selected: boolean;
  onSelect: (e: React.PointerEvent) => void;
}) {
  const { a, scale, selected } = props;
  return (
    <g>
      <line
        x1={a.x1 * scale}
        y1={a.y1 * scale}
        x2={a.x2 * scale}
        y2={a.y2 * scale}
        stroke={rgbCss(a.stroke)}
        strokeWidth={a.strokeWidth * scale}
        strokeLinecap="round"
        onPointerDown={props.onSelect}
        style={{ cursor: "move" }}
      />
      {a.type === "arrow" && <ArrowHead a={a} scale={scale} />}
      {selected && (
        <line
          x1={a.x1 * scale}
          y1={a.y1 * scale}
          x2={a.x2 * scale}
          y2={a.y2 * scale}
          stroke="#2563eb"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}
    </g>
  );
}

function ArrowHead({ a, scale }: { a: LineAnnot; scale: number }) {
  const angle = Math.atan2((a.y2 - a.y1) * scale, (a.x2 - a.x1) * scale);
  const head = Math.max(8, a.strokeWidth * scale * 4);
  const spread = (25 * Math.PI) / 180;
  const x2 = a.x2 * scale;
  const y2 = a.y2 * scale;
  const p = (sign: number) => ({
    x: x2 + head * Math.cos(angle + Math.PI + sign * spread),
    y: y2 + head * Math.sin(angle + Math.PI + sign * spread),
  });
  const a1 = p(1);
  const a2 = p(-1);
  return (
    <>
      <line
        x1={x2}
        y1={y2}
        x2={a1.x}
        y2={a1.y}
        stroke={rgbCss(a.stroke)}
        strokeWidth={a.strokeWidth * scale}
        strokeLinecap="round"
      />
      <line
        x1={x2}
        y1={y2}
        x2={a2.x}
        y2={a2.y}
        stroke={rgbCss(a.stroke)}
        strokeWidth={a.strokeWidth * scale}
        strokeLinecap="round"
      />
    </>
  );
}

function VectorInk(props: {
  a: InkAnnot;
  scale: number;
  selected: boolean;
  onSelect: (e: React.PointerEvent) => void;
}) {
  const { a, scale, selected } = props;
  const pts = a.points.map(([x, y]) => `${x * scale},${y * scale}`).join(" ");
  return (
    <polyline
      points={pts}
      fill="none"
      stroke={selected ? "#2563eb" : rgbCss(a.stroke)}
      strokeWidth={a.strokeWidth * scale}
      strokeLinecap="round"
      strokeLinejoin="round"
      onPointerDown={props.onSelect}
      style={{ cursor: "move" }}
    />
  );
}

function DraftRect({ drag, scale, tool }: { drag: Drag | null; scale: number; tool: ToolId }) {
  if (!drag || drag.mode !== "create-rect") return null;
  const r = rectFromDrag(drag.x0, drag.y0, drag.x1, drag.y1);
  const isEllipse = tool === "ellipse";
  return (
    <div
      style={{
        position: "absolute",
        left: r.x * scale,
        top: r.y * scale,
        width: r.w * scale,
        height: r.h * scale,
        border: "1px dashed #2563eb",
        borderRadius: isEllipse ? "50%" : 0,
        pointerEvents: "none",
      }}
    />
  );
}

function DraftVector({ drag, scale }: { drag: Drag | null; scale: number }) {
  if (!drag) return null;
  if (drag.mode === "create-line") {
    return (
      <line
        x1={drag.x0 * scale}
        y1={drag.y0 * scale}
        x2={drag.x1 * scale}
        y2={drag.y1 * scale}
        stroke="#2563eb"
        strokeWidth={2}
        strokeDasharray="4 3"
      />
    );
  }
  if (drag.mode === "create-ink") {
    const pts = drag.points.map(([x, y]) => `${x * scale},${y * scale}`).join(" ");
    return <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth={2} />;
  }
  return null;
}
