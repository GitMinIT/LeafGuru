/**
 * LeafGuru — UUID v4 helper.
 * crypto.randomUUID only exists in secure contexts (HTTPS/localhost); the
 * testing host serves plain HTTP, so fall back to getRandomValues-based v4.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  function uuidv4() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    (window.crypto ?? { getRandomValues: (b) => { for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256); } })
      .getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  window.LeafGuru.uuid = uuidv4;
})();
