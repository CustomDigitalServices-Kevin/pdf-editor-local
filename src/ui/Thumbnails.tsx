import type { PageEntry } from "../core/types";
import { useLocale } from "../i18n/LocaleProvider";

type Props = {
  pages: PageEntry[];
  activePage: number;
  onSelectPage: (i: number) => void;
  onRotate: (i: number) => void;
  onDelete: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onInsertBlank: () => void;
};

export function Thumbnails(props: Props) {
  const { t } = useLocale();
  const { pages } = props;
  return (
    <div className="thumbs">
      <div className="thumbs-head">{t("pages")}</div>
      <ol className="thumb-list">
        {pages.map((p, i) => (
          <li
            key={i}
            className={`thumb${i === props.activePage ? " active" : ""}`}
          >
            <button
              type="button"
              className="thumb-num"
              onClick={() => { props.onSelectPage(i); }}
              data-testid={`thumb-${i}`}
            >
              {i + 1}
              {p.source.kind === "blank" ? " ·" : ""}
              {p.rotation !== 0 ? ` ${p.rotation}°` : ""}
            </button>
            <div className="thumb-actions">
              <button
                type="button"
                title={t("rotatePage")}
                onClick={() => { props.onRotate(i); }}
                data-testid={`rotate-${i}`}
              >
                ⟳
              </button>
              <button
                type="button"
                title={t("movePageUp")}
                disabled={i === 0}
                onClick={() => { props.onMove(i, -1); }}
              >
                ↑
              </button>
              <button
                type="button"
                title={t("movePageDown")}
                disabled={i === pages.length - 1}
                onClick={() => { props.onMove(i, 1); }}
              >
                ↓
              </button>
              <button
                type="button"
                title={t("deletePage")}
                disabled={pages.length === 1}
                onClick={() => { props.onDelete(i); }}
                data-testid={`del-page-${i}`}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="ghost"
        onClick={props.onInsertBlank}
        data-testid="insert-blank"
      >
        + {t("insertBlank")}
      </button>
    </div>
  );
}
