import { useCallback, useEffect, useRef, useState } from "react";
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
import { ElementsPanel } from "./ElementsPanel";
import { Thumbnails } from "./Thumbnails";
import { Dropzone } from "./Dropzone";
import { SignatureDialog } from "./SignatureDialog";
import { IconZoomIn, IconZoomOut, IconDownload, IconFile, IconGlobe } from "./icons";

const A4 = { w: 595.28, h: 841.89 };

function normalizeRotation(deg: number): PageRotation {
  return ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as PageRotation;
}

/** Fit an image to a sensible default footprint (view points). */
async function imageDefaultSize(
  bytes: Uint8Array,
  mime: string,
): Promise<{ w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes.slice()], { type: mime }));
    const nw = bmp.width || 1;
    const nh = bmp.height || 1;
    bmp.close();
    let w = 180;
    let h = (180 * nh) / nw;
    if (h > 260) {
      h = 260;
      w = (260 * nw) / nh;
    }
    return { w: Math.round(w), h: Math.round(h) };
  } catch {
    return { w: 180, h: 120 };
  }
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scale, setScale] = useState(1.3);
  const [activePage, setActivePage] = useState(0);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Imported PDFs: pdfjs proxy for on-screen render, raw bytes for export.
  const importedDocs = useRef(new Map<string, PdfDoc>());
  const importedBytes = useRef(new Map<string, Uint8Array>());

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
    // Fit the widest page to the available canvas width (rail + panels aside).
    const maxW = Math.max(...infos.map((i) => i.mediaWidth), 1);
    const availW = window.innerWidth - 544;
    setScale(Math.min(1.8, Math.max(0.5, availW / maxW)));
  }, []);

  const reset = () => {
    setPdfBytes(null);
    setPdfDoc(null);
    setPages([]);
    setAnnotations([]);
    setSelectedId(null);
    setTool("select");
    setPendingImage(null);
    importedDocs.current.clear();
    importedBytes.current.clear();
  };

  const setPending = (
    type: "image" | "signature",
    bytes: Uint8Array,
    mime: "image/png" | "image/jpeg",
  ) => {
    void imageDefaultSize(bytes, mime).then((sz) => {
      setPendingImage({ type, bytes, mime, w: sz.w, h: sz.h });
    });
  };

  const onCreate = (a: Annotation) => {
    setAnnotations((prev) => [...prev, a]);
    setSelectedId(a.id);
    setActivePage(a.page);
    if (a.type === "text" || a.type === "image" || a.type === "signature" || a.type === "link") {
      setTool("select");
    }
    if (a.type === "image" || a.type === "signature") setPendingImage(null);
    // A fresh text box opens straight into inline editing.
    if (a.type === "text") setEditingId(a.id);
  };

  const onUpdate = (id: string, next: Annotation) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? next : a)));
  };

  const commitText = (id: string, text: string) => {
    setEditingId(null);
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id && a.type === "text" ? { ...a, text } : a)),
    );
  };

  const deleteById = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) setEditingId(null);
  };

  const onDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const tag = document.activeElement?.tagName;
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
          setPending(
            "image",
            new Uint8Array(buf),
            f.type === "image/png" ? "image/png" : "image/jpeg",
          );
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

  const mergePdf = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      void f.arrayBuffer().then(async (buf) => {
        const bytes = new Uint8Array(buf);
        const docId = crypto.randomUUID();
        const proxy = await loadPdf(bytes.slice());
        importedDocs.current.set(docId, proxy);
        importedBytes.current.set(docId, bytes);
        const added: PageEntry[] = Array.from({ length: proxy.numPages }, (_unused, i) => ({
          source: { kind: "imported", docId, index: i },
          rotation: 0,
        }));
        setPages((prev) => [...prev, ...added]);
      });
    };
    input.click();
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
        importedBytes: importedBytes.current,
      });
      download(bytes, "edited.pdf");
    } finally {
      setBusy(false);
    }
  };

  const zoomPct = Math.round(scale * 100);

  const localeBtn = (
    <button
      type="button"
      className="btn btn-ghost"
      aria-label="language"
      onClick={() => {
        setLocale(locale === "fr" ? "en" : "fr");
      }}
    >
      <IconGlobe />
      {locale === "fr" ? "EN" : "FR"}
    </button>
  );

  if (!pdfDoc) {
    return (
      <div className="app">
        <header className="topbar">
          <span className="brand">
            <span className="brand-dot" />
            {t("appTitle")}
          </span>
          <span className="spacer" />
          {localeBtn}
        </header>
        <main className="landing">
          <div className="hero">
            <h1>{t("appTitle")}</h1>
            <p>{t("tagline")}</p>
          </div>
          <Dropzone
            onFile={(f) => {
              void loadFile(f);
            }}
          />
          <span className="privacy-badge">{t("privacyNote")}</span>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="brand-dot" />
          {t("appTitle")}
        </span>
        <span className="spacer" />
        <div className="seg">
          <button
            type="button"
            aria-label="zoom out"
            onClick={() => {
              setScale((s) => Math.max(0.5, s - 0.15));
            }}
          >
            <IconZoomOut />
          </button>
          <span className="zoom-val">{zoomPct}%</span>
          <button
            type="button"
            aria-label="zoom in"
            onClick={() => {
              setScale((s) => Math.min(3, s + 0.15));
            }}
          >
            <IconZoomIn />
          </button>
        </div>
        <div className="top-actions">
          <button type="button" className="btn btn-ghost" onClick={reset}>
            <IconFile />
            {t("newFile")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              void doExport();
            }}
            data-testid="export-btn"
          >
            <IconDownload />
            {busy ? t("exporting") : t("export")}
          </button>
          {localeBtn}
        </div>
      </header>

      <div className="workspace">
        <Toolbar tool={tool} onTool={pickTool} />
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
          onMerge={mergePdf}
        />

        <div className="canvas">
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
                importedDoc={
                  entry.source.kind === "imported"
                    ? (importedDocs.current.get(entry.source.docId) ?? null)
                    : null
                }
                entry={entry}
                pageIndex={i}
                scale={scale}
                annotations={annotations.filter((a) => a.page === i)}
                selectedId={selectedId}
                editingId={editingId}
                tool={tool}
                style={DEFAULT_STYLE}
                pendingImage={pendingImage}
                onCreate={onCreate}
                onUpdate={onUpdate}
                onSelect={setSelectedId}
                onStartEdit={setEditingId}
                onCommitText={commitText}
              />
            </div>
          ))}
        </div>

        <ElementsPanel
          annotations={annotations}
          selectedId={selectedId}
          pageCount={pages.length}
          onSelect={(id) => {
            setSelectedId(id);
            const a = annotations.find((x) => x.id === id);
            if (a) {
              setActivePage(a.page);
              document
                .getElementById(`page-${a.page}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }}
          onChange={(next) => {
            onUpdate(next.id, next);
          }}
          onDelete={deleteById}
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
            setPending("signature", bytes, "image/png");
          }}
        />
      )}
    </div>
  );
}
