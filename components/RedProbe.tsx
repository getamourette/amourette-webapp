"use client";
// Temporary probe for #375: proves CodeQL flags DOM XSS. Removed before Ready.
export function RedProbe() {
  if (typeof window !== "undefined") document.getElementById("probe")!.innerHTML = decodeURIComponent(window.location.hash.slice(1));
  return <div id="probe" />;
}
