import { useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleProvider";

export function Dropzone({ onFile }: { onFile: (file: File) => void }) {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file && file.type === "application/pdf") onFile(file);
  };

  return (
    <div
      className={`dropzone${over ? " over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => { setOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <p className="drop-hint">{t("dropHint")}</p>
      <button type="button" className="primary" data-testid="choose-pdf">
        {t("dropCta")}
      </button>
      <p className="privacy">{t("privacyNote")}</p>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        data-testid="file-input"
        onChange={(e) => { pick(e.target.files); }}
      />
    </div>
  );
}
