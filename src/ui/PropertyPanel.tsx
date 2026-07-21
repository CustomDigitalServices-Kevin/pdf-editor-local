import type { ReactNode } from "react";
import type { Annotation, LinkTarget, Rgb, StandardFontKey, TextAlign } from "../core/types";
import { useLocale } from "../i18n/LocaleProvider";

function rgbToHex(c: Rgb): string {
  const h = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  const [, rr = "0", gg = "0", bb = "0"] = m;
  return {
    r: parseInt(rr, 16) / 255,
    g: parseInt(gg, 16) / 255,
    b: parseInt(bb, 16) / 255,
  };
}

const FONTS: StandardFontKey[] = [
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Times-Roman",
  "Times-Bold",
  "Times-Italic",
  "Courier",
  "Courier-Bold",
];

type FieldsProps = {
  annotation: Annotation;
  pageCount: number;
  onChange: (next: Annotation) => void;
};

// Reusable property fields for one annotation, rendered inside the expanded
// element row (the persistent right "properties menu" was removed).
export function AnnotationFields({ annotation: a, pageCount, onChange }: FieldsProps) {
  const { t } = useLocale();
  return (
    <div className="el-fields-inner">
      {(a.type === "text" ||
        a.type === "highlight" ||
        a.type === "underline" ||
        a.type === "strike") && (
        <Row label={t("color")}>
          <input
            type="color"
            value={rgbToHex(a.color)}
            onChange={(e) => {
              onChange({ ...a, color: hexToRgb(e.target.value) });
            }}
          />
        </Row>
      )}

      {(a.type === "line" || a.type === "arrow" || a.type === "ink") && (
        <Row label={t("color")}>
          <input
            type="color"
            value={rgbToHex(a.stroke)}
            onChange={(e) => {
              onChange({ ...a, stroke: hexToRgb(e.target.value) });
            }}
          />
        </Row>
      )}

      {(a.type === "rect" || a.type === "ellipse") && (
        <>
          <Row label={t("stroke")}>
            <input
              type="color"
              value={rgbToHex(a.stroke ?? { r: 0, g: 0, b: 0 })}
              onChange={(e) => {
                onChange({ ...a, stroke: hexToRgb(e.target.value) });
              }}
            />
          </Row>
          <Row label={t("fill")}>
            <input
              type="checkbox"
              checked={a.fill !== null}
              onChange={(e) => {
                onChange({
                  ...a,
                  fill: e.target.checked ? { r: 1, g: 1, b: 1 } : null,
                });
              }}
            />
            {a.fill && (
              <input
                type="color"
                value={rgbToHex(a.fill)}
                onChange={(e) => {
                  onChange({ ...a, fill: hexToRgb(e.target.value) });
                }}
              />
            )}
          </Row>
          <Row label={t("opacity")}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={a.opacity}
              onChange={(e) => {
                onChange({ ...a, opacity: Number(e.target.value) });
              }}
            />
          </Row>
        </>
      )}

      {(a.type === "rect" ||
        a.type === "ellipse" ||
        a.type === "line" ||
        a.type === "arrow" ||
        a.type === "ink") && (
        <Row label={t("strokeWidth")}>
          <input
            type="number"
            min={1}
            max={40}
            value={a.strokeWidth}
            onChange={(e) => {
              onChange({ ...a, strokeWidth: Number(e.target.value) });
            }}
          />
        </Row>
      )}

      {a.type === "text" && (
        <>
          <Row label={t("text")}>
            <textarea
              rows={3}
              value={a.text}
              onChange={(e) => {
                onChange({ ...a, text: e.target.value });
              }}
              data-testid="text-input"
            />
          </Row>
          <Row label={t("font")}>
            <select
              value={a.fontFamily}
              onChange={(e) => {
                onChange({
                  ...a,
                  fontFamily: e.target.value as StandardFontKey,
                });
              }}
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t("fontSize")}>
            <input
              type="number"
              min={6}
              max={96}
              value={a.fontSize}
              onChange={(e) => {
                onChange({ ...a, fontSize: Number(e.target.value) });
              }}
            />
          </Row>
          <Row label={t("align")}>
            <select
              value={a.align}
              onChange={(e) => {
                onChange({ ...a, align: e.target.value as TextAlign });
              }}
            >
              <option value="left">left</option>
              <option value="center">center</option>
              <option value="right">right</option>
            </select>
          </Row>
        </>
      )}

      {(a.type === "text" || a.type === "image" || a.type === "signature") && (
        <Row label={t("rotation")}>
          <input
            type="number"
            step={90}
            value={a.rotation}
            onChange={(e) => {
              onChange({
                ...a,
                rotation: ((Number(e.target.value) % 360) + 360) % 360,
              });
            }}
          />
        </Row>
      )}

      {a.type === "link" && (
        <>
          <Row label={t("linkType")}>
            <select
              value={a.target.kind}
              onChange={(e) => {
                const kind = e.target.value;
                const target: LinkTarget =
                  kind === "page"
                    ? { kind: "page", value: 0 }
                    : kind === "email"
                      ? { kind: "email", value: "" }
                      : { kind: "url", value: "https://" };
                onChange({ ...a, target });
              }}
            >
              <option value="url">{t("linkUrl")}</option>
              <option value="email">{t("linkEmail")}</option>
              <option value="page">{t("linkPage")}</option>
            </select>
          </Row>
          <Row label={t("linkTarget")}>
            {a.target.kind === "page" ? (
              <input
                type="number"
                min={1}
                max={pageCount}
                value={a.target.value + 1}
                onChange={(e) => {
                  onChange({
                    ...a,
                    target: {
                      kind: "page",
                      value: Math.max(0, Number(e.target.value) - 1),
                    },
                  });
                }}
              />
            ) : (
              <input
                type="text"
                data-testid="link-target"
                value={a.target.value}
                onChange={(e) => {
                  if (a.target.kind === "page") return;
                  onChange({ ...a, target: { ...a.target, value: e.target.value } });
                }}
              />
            )}
          </Row>
        </>
      )}

      {a.type === "whiteout" && <div className="note">{t("whiteoutWarning")}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-control">{children}</span>
    </label>
  );
}
