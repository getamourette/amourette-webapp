"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ArrivalOperations.module.css";

export function ArrivalCamera({ onCode, onStop }: { onCode: (code: string) => void; onStop: () => void }) {
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
              if (code) { stop(); onCode(code.data); return; }
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
