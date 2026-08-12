import { useEffect, useRef, useState } from "react";

interface CameraCaptureProps {
  onCapture: (blob: Blob, previewUrl: string) => void;
  disabled?: boolean;
}

export function CameraCapture({ onCapture, disabled }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        setError(
          "Camera unavailable. Use search below, or allow camera access and reload.",
        );
      }
    }

    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function handleSnap() {
    const video = videoRef.current;
    if (!video || !ready) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Crop to a card-shaped center region for cleaner OCR.
    const cropW = Math.floor(canvas.width * 0.72);
    const cropH = Math.floor(cropW * 1.4);
    const sx = Math.floor((canvas.width - cropW) / 2);
    const sy = Math.floor((canvas.height - cropH) / 2);
    const cropped = document.createElement("canvas");
    cropped.width = cropW;
    cropped.height = Math.min(cropH, canvas.height - sy);
    const cctx = cropped.getContext("2d");
    if (!cctx) return;
    cctx.drawImage(
      canvas,
      sx,
      Math.max(sy, 0),
      cropW,
      cropped.height,
      0,
      0,
      cropW,
      cropped.height,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      cropped.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) return;
    onCapture(blob, URL.createObjectURL(blob));
  }

  return (
    <div className="camera">
      <div className="camera__frame">
        {error ? (
          <div className="camera__fallback">
            <p>{error}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="camera__video"
              playsInline
              muted
              aria-label="Card camera preview"
            />
            <div className="camera__guide" aria-hidden="true" />
          </>
        )}
      </div>
      <p className="camera__tip">Fill the guide · avoid glare · hold steady</p>
      <button
        type="button"
        className="btn btn--snap"
        onClick={() => void handleSnap()}
        disabled={disabled || !ready || Boolean(error)}
      >
        Snap card
      </button>
    </div>
  );
}
