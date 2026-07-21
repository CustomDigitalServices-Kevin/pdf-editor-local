import { useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import { IconFile } from "./icons";

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
      onDragLeave={() => {
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <span className="drop-icon">
        <IconFile width={34} height={34} />
      </span>
      <p className="drop-title">{t("dropHint")}</p>
      <button type="button" className="btn btn-primary" data-testid="choose-pdf">
        {t("dropCta")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        data-testid="file-input"
        onChange={(e) => {
          pick(e.target.files);
        }}
      />
    </div>
  );
}
