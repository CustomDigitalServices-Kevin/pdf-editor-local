import type { ToolId } from "../state/defaults";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages";

const TOOLS: ToolId[] = [
  "select",
  "text",
  "rect",
  "ellipse",
  "line",
  "arrow",
  "ink",
  "highlight",
  "underline",
  "strike",
  "whiteout",
  "image",
  "signature",
  "link",
];

export function Toolbar({
  tool,
  onTool,
}: {
  tool: ToolId;
  onTool: (t: ToolId) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="toolbar" role="toolbar" aria-label={t("props")}>
      {TOOLS.map((id) => (
        <button
          key={id}
          type="button"
          className={`tool-btn${tool === id ? " active" : ""}`}
          aria-pressed={tool === id}
          onClick={() => { onTool(id); }}
          data-testid={`tool-${id}`}
        >
          {t(`tool_${id}` as MessageKey)}
        </button>
      ))}
    </div>
  );
}
