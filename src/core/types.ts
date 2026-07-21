// Domain model for the local PDF editor.
//
// Every editable object is an "annotation" living in an overlay above the
// rendered page. Coordinates are stored in the OVERLAY space (top-left origin,
// CSS pixels at the current render scale); they are converted to PDF space
// (bottom-left origin, PDF points) only at export time by src/core/coords.ts.

export type AnnotId = string;

/** RGB with each channel in the 0..1 range (matches pdf-lib's rgb()). */
export type Rgb = { r: number; g: number; b: number };

/** The 14 standard PDF fonts, which all render French accents via WinAnsi. */
export type StandardFontKey =
  | "Helvetica"
  | "Helvetica-Bold"
  | "Helvetica-Oblique"
  | "Helvetica-BoldOblique"
  | "Times-Roman"
  | "Times-Bold"
  | "Times-Italic"
  | "Times-BoldItalic"
  | "Courier"
  | "Courier-Bold"
  | "Courier-Oblique"
  | "Courier-BoldOblique";

export type TextAlign = "left" | "center" | "right";

/** A rectangle in overlay space (top-left origin, pixels). */
export type Rect = { x: number; y: number; w: number; h: number };

export type TextAnnot = Rect & {
  id: AnnotId;
  type: "text";
  page: number;
  rotation: number; // degrees, clockwise, around the rect centre
  text: string;
  fontFamily: StandardFontKey;
  fontSize: number; // px in overlay space
  color: Rgb;
  align: TextAlign;
};

export type ShapeAnnot = Rect & {
  id: AnnotId;
  type: "rect" | "ellipse";
  page: number;
  rotation: number;
  stroke: Rgb | null;
  strokeWidth: number; // px
  fill: Rgb | null;
  opacity: number; // 0..1
};

export type LineAnnot = {
  id: AnnotId;
  type: "line" | "arrow";
  page: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: Rgb;
  strokeWidth: number;
};

export type InkAnnot = {
  id: AnnotId;
  type: "ink";
  page: number;
  points: Array<[number, number]>; // overlay-space polyline
  stroke: Rgb;
  strokeWidth: number;
};

export type MarkupAnnot = Rect & {
  id: AnnotId;
  type: "highlight" | "underline" | "strike";
  page: number;
  color: Rgb;
};

export type WhiteoutAnnot = Rect & {
  id: AnnotId;
  type: "whiteout";
  page: number;
};

export type ImageAnnot = Rect & {
  id: AnnotId;
  type: "image" | "signature";
  page: number;
  rotation: number;
  /** PNG or JPEG bytes; the source format is kept for the right embed call. */
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
};

export type LinkTarget =
  | { kind: "url"; value: string }
  | { kind: "email"; value: string }
  | { kind: "page"; value: number }; // 0-based page index in the FINAL document

export type LinkAnnot = Rect & {
  id: AnnotId;
  type: "link";
  page: number;
  target: LinkTarget;
};

export type Annotation =
  | TextAnnot
  | ShapeAnnot
  | LineAnnot
  | InkAnnot
  | MarkupAnnot
  | WhiteoutAnnot
  | ImageAnnot
  | LinkAnnot;

export type AnnotationType = Annotation["type"];

/** Where a page in the final document comes from. */
export type PageSource =
  | { kind: "original"; index: number } // page index in the loaded PDF
  | { kind: "imported"; docId: string; index: number } // page from another PDF
  | { kind: "blank"; width: number; height: number }; // fresh page, PDF points

export type PageRotation = 0 | 90 | 180 | 270;

export type PageEntry = {
  source: PageSource;
  rotation: PageRotation;
};

/** fieldName -> value. string for text/dropdown, boolean for checkbox. */
export type FormValues = Record<string, string | boolean>;

/** The full editable state, serialisable and passed to the exporter. */
export type EditorDoc = {
  annotations: Annotation[];
  pages: PageEntry[];
  form: FormValues;
};

/** Geometry of one rendered page, needed to convert overlay -> PDF space. */
export type PageGeometry = {
  /** page width in PDF points (unrotated media box) */
  widthPt: number;
  /** page height in PDF points (unrotated media box) */
  heightPt: number;
  /** overlay render scale: overlayPx = pt * scale */
  scale: number;
  /** page rotation applied by the PDF (/Rotate), degrees clockwise */
  rotation: PageRotation;
};
