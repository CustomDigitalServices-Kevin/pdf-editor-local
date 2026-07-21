import type { PageEntry } from "../core/types";
import { useLocale } from "../i18n/LocaleProvider";
import { IconRotate, IconUp, IconDown, IconTrash, IconBlankPage, IconMerge } from "./icons";

type Props = {
  pages: PageEntry[];
  activePage: number;
  onSelectPage: (i: number) => void;
  onRotate: (i: number) => void;
  onDelete: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onInsertBlank: () => void;
  onMerge: () => void;
};

export function Thumbnails(props: Props) {
  const { t } = useLocale();
  const { pages } = props;
  return (
    <div className="pages-panel">
      <div className="panel-head">{t("pages")}</div>
      <ol className="thumb-list">
        {pages.map((p, i) => (
          <li key={i} className={`thumb${i === props.activePage ? " active" : ""}`}>
            <button
              type="button"
              className="thumb-index"
              onClick={() => {
                props.onSelectPage(i);
              }}
              data-testid={`thumb-${i}`}
            >
              <span>{i + 1}</span>
              <span className="thumb-badge">
                {p.source.kind === "blank"
                  ? "vierge"
                  : p.source.kind === "imported"
                    ? "importé"
                    : ""}
                {p.rotation !== 0 ? ` ${p.rotation}°` : ""}
              </span>
            </button>
            <div className="thumb-actions">
              <button
                type="button"
                className="thumb-act"
                title={t("rotatePage")}
                aria-label={t("rotatePage")}
                onClick={() => {
                  props.onRotate(i);
                }}
                data-testid={`rotate-${i}`}
              >
                <IconRotate />
              </button>
              <button
                type="button"
                className="thumb-act"
                title={t("movePageUp")}
                aria-label={t("movePageUp")}
                disabled={i === 0}
                onClick={() => {
                  props.onMove(i, -1);
                }}
              >
                <IconUp />
              </button>
              <button
                type="button"
                className="thumb-act"
                title={t("movePageDown")}
                aria-label={t("movePageDown")}
                disabled={i === pages.length - 1}
                onClick={() => {
                  props.onMove(i, 1);
                }}
              >
                <IconDown />
              </button>
              <button
                type="button"
                className="thumb-act"
                title={t("deletePage")}
                aria-label={t("deletePage")}
                disabled={pages.length === 1}
                onClick={() => {
                  props.onDelete(i);
                }}
                data-testid={`del-page-${i}`}
              >
                <IconTrash />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="panel-foot">
        <button
          type="button"
          className="btn"
          onClick={props.onInsertBlank}
          data-testid="insert-blank"
        >
          <IconBlankPage />
          {t("insertBlank")}
        </button>
        <button type="button" className="btn" onClick={props.onMerge} data-testid="merge-pdf">
          <IconMerge />
          {t("mergePdf")}
        </button>
      </div>
    </div>
  );
}
