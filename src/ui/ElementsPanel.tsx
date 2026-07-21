import type { ComponentType, SVGProps } from "react";
import type { Annotation, AnnotationType } from "../core/types";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages";
import { AnnotationFields } from "./PropertyPanel";
import {
  IconText,
  IconImage,
  IconSignature,
  IconRect,
  IconEllipse,
  IconLine,
  IconArrow,
  IconHighlight,
  IconUnderline,
  IconStrike,
  IconInk,
  IconWhiteout,
  IconLink,
  IconTrash,
} from "./icons";

type IconCmp = ComponentType<SVGProps<SVGSVGElement>>;

const TYPE_ICON: Record<AnnotationType, IconCmp> = {
  text: IconText,
  rect: IconRect,
  ellipse: IconEllipse,
  line: IconLine,
  arrow: IconArrow,
  ink: IconInk,
  highlight: IconHighlight,
  underline: IconUnderline,
  strike: IconStrike,
  whiteout: IconWhiteout,
  image: IconImage,
  signature: IconSignature,
  link: IconLink,
};

function label(a: Annotation, t: (k: MessageKey) => string): string {
  const base = t(`tool_${a.type}` as MessageKey);
  if (a.type === "text") {
    const text = a.text.trim();
    return text ? (text.length > 26 ? `${text.slice(0, 26)}…` : text) : base;
  }
  if (a.type === "link") {
    const target = a.target.kind === "page" ? `p.${a.target.value + 1}` : a.target.value;
    return `${base} · ${target}`;
  }
  return base;
}

type Props = {
  annotations: Annotation[];
  selectedId: string | null;
  pageCount: number;
  onSelect: (id: string) => void;
  onChange: (next: Annotation) => void;
  onDelete: (id: string) => void;
};

export function ElementsPanel({
  annotations,
  selectedId,
  pageCount,
  onSelect,
  onChange,
  onDelete,
}: Props) {
  const { t } = useLocale();

  if (annotations.length === 0) {
    return <div className="props-empty">{t("noElements")}</div>;
  }

  return (
    <div className="elements">
      <div className="props-head">
        {t("elements")} <span className="el-count">{annotations.length}</span>
      </div>
      <ol className="el-list">
        {annotations.map((a) => {
          const Icon = TYPE_ICON[a.type];
          const active = a.id === selectedId;
          return (
            <li key={a.id} className={`el-item${active ? " active" : ""}`}>
              <div
                className="el-row"
                onClick={() => {
                  onSelect(a.id);
                }}
                data-testid={`el-${a.id}`}
              >
                <span className="el-icon">
                  <Icon />
                </span>
                <span className="el-label">{label(a, t)}</span>
                <button
                  type="button"
                  className="el-del"
                  title={t("deleteEl")}
                  aria-label={t("deleteEl")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(a.id);
                  }}
                  data-testid={`el-del-${a.id}`}
                >
                  <IconTrash width={16} height={16} />
                </button>
              </div>
              {active && (
                <div className="el-fields">
                  <AnnotationFields annotation={a} pageCount={pageCount} onChange={onChange} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
