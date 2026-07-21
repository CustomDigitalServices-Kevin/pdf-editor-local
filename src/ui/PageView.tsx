import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { PdfDoc } from "../engines/pdf/render";
import { renderPage } from "../engines/pdf/render";
import type { Annotation, PageEntry, LineAnnot, InkAnnot, ImageAnnot } from "../core/types";
import type { Style, ToolId } from "../state/defaults";
import {
  PLACEMENT_TOOLS,
  defaultBoxSize,
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
import { useLocale } from "../i18n/LocaleProvider";

const ACCENT = "#f0883e";

export type PendingImage = {
  type: "image" | "signature";
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  /** default footprint in view points */
  w: number;
  h: number;
};

type Props = {
  pdfDoc: PdfDoc | null;
  importedDoc: PdfDoc | null;
  entry: PageEntry;
  pageIndex: number; // final index
  scale: number;
  annotations: Annotation[];
  selectedId: string | null;
  tool: ToolId;
  style: Style;
  pendingImage: PendingImage | null;
  editingId: string | null;
  onCreate: (a: Annotation) => void;
  onUpdate: (id: string, next: Annotation) => void;
  onSelect: (id: string | null) => void;
  onStartEdit: (id: string) => void;
  onCommitText: (id: string, text: string) => void;
};

type Drag =
  | { mode: "create-line"; x0: number; y0: number; x1: number; y1: number }
  | { mode: "create-ink"; points: Array<[number, number]> }
  | { mode: "move"; id: string; orig: Annotation; startVx: number; startVy: number }
  | { mode: "resize"; id: string; orig: Annotation; startVx: number; startVy: number };

type Placement = { w: number; h: number; round: boolean; img: PendingImage | null };

export function PageView(props: Props) {
  const { pdfDoc, importedDoc, entry, pageIndex, scale, annotations, selectedId, tool, style } =
    props;
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);

  // What a click will drop, or null for select/stroke tools.
  const placement = useMemo<Placement | null>(() => {
    if (!PLACEMENT_TOOLS.includes(tool)) return null;
    if (tool === "image" || tool === "signature") {
      return props.pendingImage
        ? {
            w: props.pendingImage.w,
            h: props.pendingImage.h,
            round: false,
            img: props.pendingImage,
          }
        : null;
    }
    const s = defaultBoxSize(tool, style);
    return { w: s.w, h: s.h, round: tool === "ellipse", img: null };
  }, [tool, props.pendingImage, style]);

  const ghostUrl = useMemo(() => {
    if (placement?.img) {
      return URL.createObjectURL(
        new Blob([placement.img.bytes.slice()], { type: placement.img.mime }),
      );
    }
    return null;
  }, [placement?.img]);
  useEffect(
    () => () => {
      if (ghostUrl) URL.revokeObjectURL(ghostUrl);
    },
    [ghostUrl],
  );

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
    const doc = src.kind === "imported" ? importedDoc : pdfDoc;
    if (doc) {
      renderPage(doc, src.index + 1, canvas, scale, entry.rotation)
        .then((s) => {
          if (!cancelled) setSize({ w: s.widthPx, h: s.heightPx });
        })
        .catch(() => {
          /* render failure leaves the previous frame */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, importedDoc, entry.source, entry.rotation, scale]);

  const toView = (clientX: number, clientY: number): { vx: number; vy: number } => {
    const rect = overlayRef.current?.getBoundingClientRect();
    return { vx: (clientX - (rect?.left ?? 0)) / scale, vy: (clientY - (rect?.top ?? 0)) / scale };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const { vx, vy } = toView(e.clientX, e.clientY);
    overlayRef.current?.setPointerCapture(e.pointerId);

    if (tool === "select") {
      props.onSelect(null);
      return;
    }
    if (placement) {
      const x = vx - placement.w / 2;
      const y = vy - placement.h / 2;
      if (tool === "text") {
        props.onCreate(createTextAnnotation(pageIndex, x, y, style));
      } else if ((tool === "image" || tool === "signature") && placement.img) {
        props.onCreate(
          createImageAnnotation(
            placement.img.type,
            pageIndex,
            { x, y, w: placement.w, h: placement.h },
            placement.img.bytes,
            placement.img.mime,
          ),
        );
      } else {
        props.onCreate(
          createRectTool(tool, pageIndex, { x, y, w: placement.w, h: placement.h }, style),
        );
      }
      return;
    }
    if (tool === "line" || tool === "arrow") {
      setDrag({ mode: "create-line", x0: vx, y0: vy, x1: vx, y1: vy });
    } else if (tool === "ink") {
      setDrag({ mode: "create-ink", points: [[vx, vy]] });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { vx, vy } = toView(e.clientX, e.clientY);
    if (drag) {
      if (drag.mode === "create-line") {
        setDrag({ ...drag, x1: vx, y1: vy });
      } else if (drag.mode === "create-ink") {
        setDrag({ mode: "create-ink", points: [...drag.points, [vx, vy]] });
      } else if (drag.mode === "move") {
        props.onUpdate(
          drag.id,
          translateAnnotation(drag.orig, vx - drag.startVx, vy - drag.startVy),
        );
      } else {
        const base = annotationRect(drag.orig);
        if (base) {
          props.onUpdate(
            drag.id,
            resizeAnnotation(drag.orig, rectFromDrag(base.x, base.y, vx, vy)),
          );
        }
      }
      return;
    }
    // Ghost: direct DOM transform, no React state per frame.
    if (placement) {
      const el = ghostRef.current;
      if (el) {
        el.style.display = "block";
        const gx = (vx - placement.w / 2) * scale;
        const gy = (vy - placement.h / 2) * scale;
        el.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    overlayRef.current?.releasePointerCapture(e.pointerId);
    if (!drag) return;
    if (drag.mode === "create-line" && (tool === "line" || tool === "arrow")) {
      props.onCreate(createLineTool(tool, pageIndex, drag.x0, drag.y0, drag.x1, drag.y1, style));
    } else if (drag.mode === "create-ink" && drag.points.length >= 2) {
      props.onCreate(createInkAnnotation(pageIndex, drag.points, style));
    }
    setDrag(null);
  };

  const onPointerLeave = () => {
    const el = ghostRef.current;
    if (el) el.style.display = "none";
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
        className={`page-overlay${placement || tool === "line" || tool === "arrow" || tool === "ink" ? " placing" : ""}`}
        style={{ width: size.w, height: size.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
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
              editing={a.id === props.editingId}
              onMove={(e) => {
                startMove(e, a);
              }}
              onResize={(e) => {
                startResize(e, a);
              }}
              onStartEdit={() => {
                props.onStartEdit(a.id);
              }}
              onCommitText={(text) => {
                props.onCommitText(a.id, text);
              }}
            />
          );
        })}

        {placement && (
          <div
            ref={ghostRef}
            className={`ghost${placement.round ? " round" : ""}`}
            style={{ width: placement.w * scale, height: placement.h * scale }}
          >
            {ghostUrl && <img src={ghostUrl} alt="" />}
            <span className="ghost-hint">{t("placeHint")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function rgbCss(c: { r: number; g: number; b: number }): string {
  return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
}

// Uncontrolled contentEditable: the DOM owns the text during editing (no state
// per keystroke, so the caret never jumps). Value is committed on blur/Escape.
function EditableText({
  initial,
  onCommit,
}: {
  initial: string;
  onCommit: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.textContent !== initial) el.textContent = initial;
    // Focus on the NEXT frame, after the placing click's default focus has
    // settled: focusing during the same click would be immediately blurred
    // (the click moves focus to the page), unmounting the editor.
    const raf = requestAnimationFrame(() => {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
    return () => {
      cancelAnimationFrame(raf);
    };
    // Mount-only: never rewrite the node while the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-testid="text-edit"
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          ref.current?.blur();
        }
      }}
      onBlur={() => {
        onCommit(ref.current?.textContent ?? "");
      }}
      style={{
        width: "100%",
        height: "100%",
        outline: "none",
        cursor: "text",
        whiteSpace: "pre-wrap",
      }}
    />
  );
}

function BoxAnnot(props: {
  a: Annotation;
  rect: { x: number; y: number; w: number; h: number };
  scale: number;
  selected: boolean;
  editing: boolean;
  onMove: (e: React.PointerEvent) => void;
  onResize: (e: React.PointerEvent) => void;
  onStartEdit: () => void;
  onCommitText: (text: string) => void;
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
    outline: selected ? `1.5px solid ${ACCENT}` : "none",
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
    style.border = `1px dashed ${ACCENT}`;
    style.background = "rgba(240,136,62,0.08)";
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
    style.whiteSpace = "pre-wrap";
    style.overflow = props.editing ? "visible" : "hidden";
    if (props.editing) style.cursor = "text";
    inner = props.editing ? (
      <EditableText initial={a.text} onCommit={props.onCommitText} />
    ) : (
      a.text
    );
  } else if (a.type === "image" || a.type === "signature") {
    inner = <ImageAnnotImg a={a} />;
  }

  return (
    <div
      style={style}
      onPointerDown={props.onMove}
      onDoubleClick={a.type === "text" ? props.onStartEdit : undefined}
      data-annot={a.id}
    >
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
            background: ACCENT,
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
      style={{ width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }}
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
          stroke={ACCENT}
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
      stroke={selected ? ACCENT : rgbCss(a.stroke)}
      strokeWidth={a.strokeWidth * scale}
      strokeLinecap="round"
      strokeLinejoin="round"
      onPointerDown={props.onSelect}
      style={{ cursor: "move" }}
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
        stroke={ACCENT}
        strokeWidth={2}
        strokeDasharray="4 3"
      />
    );
  }
  if (drag.mode === "create-ink") {
    const pts = drag.points.map(([x, y]) => `${x * scale},${y * scale}`).join(" ");
    return <polyline points={pts} fill="none" stroke={ACCENT} strokeWidth={2} />;
  }
  return null;
}
