import type { ComponentType, SVGProps } from "react";
import type { ToolId } from "../state/defaults";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages";
import {
  IconSelect,
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
} from "./icons";

type IconCmp = ComponentType<SVGProps<SVGSVGElement>>;

// Grouped like a design tool's left rail; separators between groups.
const GROUPS: Array<Array<{ id: ToolId; Icon: IconCmp }>> = [
  [{ id: "select", Icon: IconSelect }],
  [
    { id: "text", Icon: IconText },
    { id: "image", Icon: IconImage },
    { id: "signature", Icon: IconSignature },
  ],
  [
    { id: "rect", Icon: IconRect },
    { id: "ellipse", Icon: IconEllipse },
    { id: "line", Icon: IconLine },
    { id: "arrow", Icon: IconArrow },
  ],
  [
    { id: "highlight", Icon: IconHighlight },
    { id: "underline", Icon: IconUnderline },
    { id: "strike", Icon: IconStrike },
  ],
  [
    { id: "ink", Icon: IconInk },
    { id: "whiteout", Icon: IconWhiteout },
    { id: "link", Icon: IconLink },
  ],
];

export function Toolbar({ tool, onTool }: { tool: ToolId; onTool: (t: ToolId) => void }) {
  const { t } = useLocale();
  return (
    <div className="toolrail" role="toolbar" aria-label={t("tools")} aria-orientation="vertical">
      {GROUPS.map((group, gi) => (
        <div key={gi} style={{ display: "contents" }}>
          {gi > 0 && <span className="rail-sep" aria-hidden="true" />}
          {group.map((item) => {
            const label = t(`tool_${item.id}` as MessageKey);
            return (
              <button
                key={item.id}
                type="button"
                className={`tool${tool === item.id ? " active" : ""}`}
                aria-pressed={tool === item.id}
                title={label}
                onClick={() => {
                  onTool(item.id);
                }}
                data-testid={`tool-${item.id}`}
              >
                <item.Icon />
                <span className="tool-label">{label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
