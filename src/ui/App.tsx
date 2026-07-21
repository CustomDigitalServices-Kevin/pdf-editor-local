import { useCallback, useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import { loadPdf, getPageInfo } from "../engines/pdf/render";
import type { PdfDoc } from "../engines/pdf/render";
import type { Annotation, PageEntry, PageRotation } from "../core/types";
import { exportPdf } from "../core/export";
import { DEFAULT_STYLE } from "../state/defaults";
import type { ToolId } from "../state/defaults";
import { Toolbar } from "./Toolbar";
import { PageView } from "./PageView";
import type { PendingImage } from "./PageView";
import { PropertyPanel } from "./PropertyPanel";
import { Thumbnails } from "./Thumbnails";
import { Dropzone } from "./Dropzone";
import { SignatureDialog } from "./SignatureDialog";

const A4 = { w: 595.28, h: 841.89 };

function normalizeRotation(deg: number): PageRotation {
  const r = (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
  return r as PageRotation;
}

function download(bytes: Uint8Array, name: string): void {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export function App() {
  const { t, locale, setLocale } = useLocale();
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDoc | null>(null);
  const [blankSize, setBlankSize] = useState(A4);
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tool, setTool] = useState<ToolId>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(1.3);
  const [activePage, setActivePage] = useState(0);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = annotations.find((a) => a.id === selectedId) ?? null;

  const loadFile = useCallback(async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await loadPdf(bytes);
    const infos = await Promise.all(
      Array.from({ length: doc.numPages }, (_, i) => getPageInfo(doc, i + 1)),
    );
    setPdfBytes(bytes);
    setPdfDoc(doc);
    setBlankSize(infos[0] ? { w: infos[0].mediaWidth, h: infos[0].mediaHeight } : A4);
    setPages(
      infos.map((info, i) => ({
        source: { kind: "original", index: i },
        rotation: normalizeRotation(info.intrinsicRotation),
      })),
    );
    setAnnotations([]);
    setSelectedId(null);
    setActivePage(0);
  }, []);

  const reset = () => {
    setPdfBytes(null);
    setPdfDoc(null);
    setPages([]);
    setAnnotations([]);
    setSelectedId(null);
    setTool("select");
  };

  const onCreate = (a: Annotation) => {
    setAnnotations((prev) => [...prev, a]);
    setSelectedId(a.id);
    setActivePage(a.page);
    if (a.type === "text" || a.type === "image" || a.type === "signature" || a.type === "link") {
      setTool("select");
    }
    if (a.type === "image" || a.type === "signature") setPendingImage(null);
  };

  const onUpdate = (id: string, next: Annotation) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? next : a)));
  };

  const onDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const el = document.activeElement;
        const tag = el?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        onDeleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [selectedId, onDeleteSelected]);

  const pickTool = (id: ToolId) => {
    setTool(id);
    setSelectedId(null);
    if (id === "image") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg";
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        void f.arrayBuffer().then((buf) => {
          setPendingImage({
            type: "image",
            bytes: new Uint8Array(buf),
            mime: f.type === "image/png" ? "image/png" : "image/jpeg",
          });
        });
      };
      input.click();
    } else if (id === "signature") {
      setSignOpen(true);
    } else {
      setPendingImage(null);
    }
  };

  // --- page operations, keeping annotation.page indices consistent ---
  const rotatePage = (i: number) => {
    setPages((prev) =>
      prev.map((p, idx) =>
        idx === i ? { ...p, rotation: ((p.rotation + 90) % 360) as PageRotation } : p,
      ),
    );
  };

  const deletePage = (i: number) => {
    if (pages.length <= 1) return;
    setPages((prev) => prev.filter((_, idx) => idx !== i));
    setAnnotations((prev) =>
      prev.filter((a) => a.page !== i).map((a) => (a.page > i ? { ...a, page: a.page - 1 } : a)),
    );
    setSelectedId(null);
  };

  const insertBlank = () => {
    const at = activePage;
    const entry: PageEntry = {
      source: { kind: "blank", width: blankSize.w, height: blankSize.h },
      rotation: 0,
    };
    setPages((prev) => [...prev.slice(0, at + 1), entry, ...prev.slice(at + 1)]);
    setAnnotations((prev) => prev.map((a) => (a.page > at ? { ...a, page: a.page + 1 } : a)));
  };

  const movePage = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= pages.length) return;
    setPages((prev) => {
      const copy = [...prev];
      const a = copy[i];
      const b = copy[j];
      if (a && b) {
        copy[i] = b;
        copy[j] = a;
      }
      return copy;
    });
    setAnnotations((prev) =>
      prev.map((a) => (a.page === i ? { ...a, page: j } : a.page === j ? { ...a, page: i } : a)),
    );
  };

  const doExport = async () => {
    if (!pdfBytes) return;
    setBusy(true);
    try {
      const bytes = await exportPdf({
        originalBytes: pdfBytes,
        doc: { annotations, pages, form: {} },
      });
      download(bytes, "edited.pdf");
    } finally {
      setBusy(false);
    }
  };

  if (!pdfDoc) {
    return (
      <div className="app">
        <header className="topbar">
          <span className="brand">{t("appTitle")}</span>
          <LocaleToggle locale={locale} setLocale={setLocale} />
        </header>
        <main className="landing">
          <p className="tagline">{t("tagline")}</p>
          <Dropzone
            onFile={(f) => {
              void loadFile(f);
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">{t("appTitle")}</span>
        <div className="spacer" />
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setScale((s) => Math.max(0.5, s - 0.15));
          }}
        >
          −
        </button>
        <span className="zoom">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setScale((s) => Math.min(3, s + 0.15));
          }}
        >
          +
        </button>
        <button type="button" className="ghost" onClick={reset}>
          {t("newFile")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => {
            void doExport();
          }}
          data-testid="export-btn"
        >
          {busy ? t("exporting") : t("export")}
        </button>
        <LocaleToggle locale={locale} setLocale={setLocale} />
      </header>

      <Toolbar tool={tool} onTool={pickTool} />

      <div className="workspace">
        <Thumbnails
          pages={pages}
          activePage={activePage}
          onSelectPage={(i) => {
            setActivePage(i);
            document
              .getElementById(`page-${i}`)
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          onRotate={rotatePage}
          onDelete={deletePage}
          onMove={movePage}
          onInsertBlank={insertBlank}
        />

        <div className="pages-scroll">
          {pages.map((entry, i) => (
            <div
              className="page-wrap"
              id={`page-${i}`}
              key={`${entry.source.kind}-${i}`}
              onPointerDown={() => {
                setActivePage(i);
              }}
            >
              <PageView
                pdfDoc={pdfDoc}
                entry={entry}
                pageIndex={i}
                scale={scale}
                annotations={annotations.filter((a) => a.page === i)}
                selectedId={selectedId}
                tool={tool}
                style={DEFAULT_STYLE}
                pendingImage={pendingImage}
                onCreate={onCreate}
                onUpdate={onUpdate}
                onSelect={setSelectedId}
              />
            </div>
          ))}
        </div>

        <PropertyPanel
          annotation={selected}
          pageCount={pages.length}
          onChange={(next) => {
            onUpdate(next.id, next);
          }}
          onDelete={onDeleteSelected}
        />
      </div>

      {signOpen && (
        <SignatureDialog
          onCancel={() => {
            setSignOpen(false);
            setTool("select");
          }}
          onDone={(bytes) => {
            setSignOpen(false);
            setPendingImage({ type: "signature", bytes, mime: "image/png" });
          }}
        />
      )}
    </div>
  );
}

function LocaleToggle({
  locale,
  setLocale,
}: {
  locale: "fr" | "en";
  setLocale: (l: "fr" | "en") => void;
}) {
  return (
    <button
      type="button"
      className="ghost"
      onClick={() => {
        setLocale(locale === "fr" ? "en" : "fr");
      }}
    >
      {locale === "fr" ? "EN" : "FR"}
    </button>
  );
}
