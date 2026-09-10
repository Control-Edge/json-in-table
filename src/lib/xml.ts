export const escapeXmlText = (val: string): string =>
  val.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const escapeXmlAttr = (val: string): string => escapeXmlText(val).replace(/"/g, "&quot;");

/** Coerce raw XML text the same way CSV cells are coerced, so both imports produce consistently typed values */
const coerceValue = (v: string): unknown => {
  if (v === "") return "";
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (!isNaN(Number(v)) && v.trim() !== "") return Number(v);
  return v;
};

/** Force a string into a valid XML element/attribute name */
const sanitizeTagName = (name: string): string => {
  let tag = name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  if (!tag || /^[0-9.-]/.test(tag)) tag = `_${tag}`;
  return tag;
};

const elementToJson = (el: Element): unknown => {
  const attrs = Array.from(el.attributes);
  const childEls = Array.from(el.children);

  if (childEls.length === 0) {
    const text = el.textContent ?? "";
    if (attrs.length === 0) return coerceValue(text);
    const obj: Record<string, unknown> = {};
    attrs.forEach((a) => { obj[`@${a.name}`] = coerceValue(a.value); });
    if (text.trim() !== "") obj["#text"] = coerceValue(text);
    return obj;
  }

  const obj: Record<string, unknown> = {};
  attrs.forEach((a) => { obj[`@${a.name}`] = coerceValue(a.value); });

  const groups = new Map<string, Element[]>();
  childEls.forEach((c) => {
    const list = groups.get(c.tagName) ?? [];
    list.push(c);
    groups.set(c.tagName, list);
  });
  groups.forEach((els, tag) => {
    obj[tag] = els.length === 1 ? elementToJson(els[0]) : els.map(elementToJson);
  });
  return obj;
};

/** Parse XML text into a plain JS value, mirroring JSON.parse's shape as closely as XML allows. */
export const xmlToJson = (xmlText: string): unknown => {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid XML");
  const root = doc.documentElement;
  if (!root) throw new Error("Invalid XML: no root element");
  const parsed = elementToJson(root);
  // A root that only wraps a repeated child (e.g. <items><item/><item/></items>) is the
  // common XML encoding of a list — unwrap it so it behaves like a JSON array tab.
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const keys = Object.keys(parsed as Record<string, unknown>);
    if (keys.length === 1 && Array.isArray((parsed as Record<string, unknown>)[keys[0]])) {
      return (parsed as Record<string, unknown>)[keys[0]];
    }
  }
  return parsed;
};

/** Best-effort detection of XML text, for auto-detection in paste/drop like isTabularText does for CSV */
export const isXmlText = (text: string): boolean => /^\s*(<\?xml[\s\S]*?\?>\s*)?<[a-zA-Z_]/.test(text);

const renderValue = (tag: string, value: unknown, indent: string): string => {
  const t = sanitizeTagName(tag);
  if (Array.isArray(value)) {
    return value.map((v) => renderValue(t, v, indent)).join("\n");
  }
  if (value === null || value === undefined) {
    return `${indent}<${t}/>`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const attrParts: string[] = [];
    const childParts: string[] = [];
    let textContent: string | undefined;
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (key.startsWith("@")) {
        attrParts.push(` ${sanitizeTagName(key.slice(1))}="${escapeXmlAttr(String(v))}"`);
      } else if (key === "#text") {
        textContent = String(v);
      } else {
        childParts.push(renderValue(key, v, indent + "  "));
      }
    }
    const attrs = attrParts.join("");
    if (childParts.length === 0 && textContent === undefined) return `${indent}<${t}${attrs}/>`;
    if (childParts.length === 0) return `${indent}<${t}${attrs}>${escapeXmlText(textContent!)}</${t}>`;
    return `${indent}<${t}${attrs}>\n${childParts.join("\n")}\n${indent}</${t}>`;
  }
  const text = String(value);
  if (text === "") return `${indent}<${t}/>`;
  return `${indent}<${t}>${escapeXmlText(text)}</${t}>`;
};

/** Serialize a plain JS value (object/array/scalar) into an XML document under a single root element. */
export const jsonToXml = (value: unknown, rootTag = "root", itemTag = "item"): string => {
  const header = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const t = sanitizeTagName(rootTag);
  if (Array.isArray(value)) {
    const body = value.map((v) => renderValue(itemTag, v, "  ")).join("\n");
    return header + (body ? `<${t}>\n${body}\n</${t}>` : `<${t}/>`);
  }
  return header + renderValue(t, value, "");
};

/** Turn a flat "a.b.c" key into nested object structure, since XML has no dotted-key shorthand */
const unflattenForXml = (row: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const parts = key.split(".");
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof current[part] !== "object" || current[part] === null || Array.isArray(current[part])) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = row[key];
  }
  return result;
};

/** Serialize tabular rows (as produced for CSV export) into an XML document of <rootTag><rowTag>...</rowTag>...</rootTag> */
export const rowsToXml = (
  columns: string[],
  rows: Record<string, unknown>[],
  rootTag = "rows",
  rowTag = "row"
): string => {
  const nested = rows.map((row) => {
    const picked: Record<string, unknown> = {};
    columns.forEach((c) => { picked[c] = row[c]; });
    return unflattenForXml(picked);
  });
  return jsonToXml(nested, rootTag, rowTag);
};
