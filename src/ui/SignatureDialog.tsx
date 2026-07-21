import { useRef } from "react";
import type React from "react";
import { useLocale } from "../i18n/LocaleProvider";

type Props = {
  onDone: (bytes: Uint8Array) => void;
  onCancel: () => void;
};

/** Draw a signature on a transparent canvas and hand back PNG bytes. */
export function SignatureDialog({ onDone, onCancel }: Props) {
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current;
    const r = c?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const p = pos(e);
    const l = last.current;
    if (ctx && l) {
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    last.current = p;
  };
  const up = () => {
    drawing.current = false;
    last.current = null;
  };
  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
  };

  const validate = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob((blob) => {
      if (!blob) return;
      void blob.arrayBuffer().then((buf) => {
        onDone(new Uint8Array(buf));
      });
    }, "image/png");
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="modal-title">{t("tool_signature")}</div>
        <canvas
          ref={canvasRef}
          width={480}
          height={180}
          className="sign-canvas"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          data-testid="sign-canvas"
        />
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={clear}>
            {t("none")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t("deleteEl")}
          </button>
          <button type="button" className="btn btn-primary" onClick={validate} data-testid="sign-done">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
