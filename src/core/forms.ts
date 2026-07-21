// Fill EXISTING AcroForm fields. Creating new fields is out of scope for v1.
//
// Values are matched by field name. Each field is filled according to its real
// type; an unknown name or a type mismatch is skipped rather than throwing, so
// one bad value never aborts the whole export.

import {
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
} from "@cantoo/pdf-lib";
import type { PDFDocument } from "@cantoo/pdf-lib";
import type { FormValues } from "./types";

/** Names of the fields that actually exist in the document's AcroForm. */
export function formFieldNames(doc: PDFDocument): string[] {
  try {
    return doc
      .getForm()
      .getFields()
      .map((f) => f.getName());
  } catch {
    return [];
  }
}

export function fillForm(doc: PDFDocument, values: FormValues): void {
  if (Object.keys(values).length === 0) return;
  const form = doc.getForm();
  const byName = new Map(form.getFields().map((f) => [f.getName(), f]));

  for (const [name, value] of Object.entries(values)) {
    const field = byName.get(name);
    if (!field) continue;
    try {
      if (field instanceof PDFTextField) {
        field.setText(typeof value === "string" ? value : String(value));
      } else if (field instanceof PDFCheckBox) {
        if (value === true || value === "true") field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup) {
        if (typeof value === "string" && value) field.select(value);
      } else if (field instanceof PDFDropdown) {
        if (typeof value === "string" && value) field.select(value);
      } else if (field instanceof PDFOptionList) {
        if (typeof value === "string" && value) field.select(value);
      }
    } catch {
      // Skip a value that does not fit the field (e.g. option not in the list).
    }
  }
}
