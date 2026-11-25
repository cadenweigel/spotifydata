/**
 * Loaded once before the test suite. Registers DOM matchers such as
 * toBeInTheDocument, and unmounts rendered components after each test.
 * Vitest does not provide a global afterEach, so Testing Library does not
 * do that on its own. Tests of plain functions do not need to import this.
 */

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// This jsdom build's Blob has no text() or arrayBuffer(). Browsers do.
// FileReader is the fallback those methods are specified in terms of.
const blobPrototype = Blob.prototype as Blob & {
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};
if (typeof blobPrototype.text !== "function") {
  blobPrototype.text = function text(this: Blob) {
    return readBlob(this, "text") as Promise<string>;
  };
}
if (typeof blobPrototype.arrayBuffer !== "function") {
  blobPrototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return readBlob(this, "arrayBuffer") as Promise<ArrayBuffer>;
  };
}

function readBlob(
  blob: Blob,
  mode: "text" | "arrayBuffer",
): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result == null) reject(new Error("empty read"));
      else resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    if (mode === "text") reader.readAsText(blob);
    else reader.readAsArrayBuffer(blob);
  });
}

afterEach(() => {
  cleanup();
});
