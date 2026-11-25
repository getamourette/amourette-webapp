"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ArrivalOperations.module.css";

// The frame the code was read from, and where the code sits in it (fractions of
// the frame), so the door can hold the read moment on screen (#534).
export type ArrivalSnapshot = { src: string; aspect: number; box: { left: number; top: number; width: number; height: number } };

export function ArrivalCamera({ onCode, onStop }: { onCode: (code: string, snapshot?: ArrivalSnapshot) => void; onStop: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { disposed = true; clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); };
    const hidden = () => { if (document.hidden) { stop(); onStop(); } };
    document.addEventListener("visibilitychange", hidden);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (disposed) { stream.getTracks().forEach(track => track.stop()); return; }
        const element = video.current;
        if (!element) { stop(); return; }
        element.srcObject = stream;
        await element.play();
        const { default: decode } = await import("jsqr");
        if (disposed) return;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Camera unavailable");
        setReady(true);
        const scan = () => {
          if (disposed) return;
          try {
            if (element.readyState >= 2 && element.videoWidth > 0 && element.videoHeight > 0) {
              const scale = Math.min(1, 800 / Math.max(element.videoWidth, element.videoHeight));
              canvas.width = Math.max(1, Math.round(element.videoWidth * scale));
              canvas.height = Math.max(1, Math.round(element.videoHeight * scale));
              context.drawImage(element, 0, 0, canvas.width, canvas.height);
              const frame = context.getImageData(0, 0, canvas.width, canvas.height);
              const code = decode(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" });
              if (code) {
                stop();
                let snapshot: ArrivalSnapshot | undefined;
                try {
                  const { topLeftCorner: a, topRightCorner: b, bottomLeftCorner: c, bottomRightCorner: d } = code.location;
                  const xs = [a.x, b.x, c.x, d.x], ys = [a.y, b.y, c.y, d.y];
                  const left = Math.max(0, Math.min(...xs) / canvas.width), top = Math.max(0, Math.min(...ys) / canvas.height);
                  snapshot = { src: canvas.toDataURL("image/jpeg", 0.7), aspect: canvas.width / canvas.height,
                    box: { left, top, width: Math.min(1 - left, (Math.max(...xs) - Math.min(...xs)) / canvas.width), height: Math.min(1 - top, (Math.max(...ys) - Math.min(...ys)) / canvas.height) } };
                } catch { /* The read still counts without its picture. */ }
                onCode(code.data, snapshot); return;
              }
            }
            timer = setTimeout(scan, 250);
          } catch { stop(); setError("The camera stopped. Close it and try again, or use manual lookup."); }
        };
        scan();
      } catch {
        if (disposed) return;
        stop();
        setError("Camera unavailable or permission denied. Allow camera access and try again, or use manual lookup.");
      }
    }
    void start();
    return () => { stop(); document.removeEventListener("visibilitychange", hidden); };
  }, [onCode, onStop]);
  return <div className={styles.camera}>
    <video ref={video} autoPlay playsInline muted aria-label="Arrival QR camera preview" />
    {error ? <p role="alert">{error}</p> : <p role="status">{ready ? "Point the camera at the guest’s personal reservation QR." : "Opening camera…"}</p>}
    <button type="button" onClick={onStop}>Close camera</button>
  </div>;
}
