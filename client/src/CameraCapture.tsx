import { useEffect, useRef, useState, type ReactNode } from "react";
import { assessCaptureQuality, type CaptureQuality } from "./captureQuality";

export interface CapturePayload {
  blob: Blob;
  previewUrl: string;
  quality: CaptureQuality;
}

interface CameraCaptureProps {
  onCapture: (payload: CapturePayload) => void;
  disabled?: boolean;
  /** Keep the screen awake while the camera is active (Scan tab). */
  keepAwake?: boolean;
  /** Shrink preview while confirm sheet owns the screen (batch still live). */
  collapsed?: boolean;
  /** Single-card guide vs full binder-page grid. */
  captureMode?: "card" | "page";
  pageRows?: number;
  pageCols?: number;
  /** Centered overlay (match choices / busy). Hides the shutter while set. */
  overlay?: ReactNode;
}

type TorchCapableTrack = MediaStreamTrack & {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
};

export function CameraCapture({
  onCapture,
  disabled,
  keepAwake = false,
  collapsed = false,
  captureMode = "card",
  pageRows = 3,
  pageCols = 3,
  overlay = null,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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
        const track = stream.getVideoTracks()[0] as TorchCapableTrack | undefined;
        const caps = track?.getCapabilities?.() as
          | (MediaTrackCapabilities & { torch?: boolean })
          | undefined;
        setTorchSupported(Boolean(caps && "torch" in caps && caps.torch));
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
      setTorchOn(false);
      setTorchSupported(false);
    };
  }, []);

  useEffect(() => {
    if (!keepAwake || typeof navigator === "undefined" || !navigator.wakeLock) {
      return;
    }
    let cancelled = false;

    async function requestLock() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        });
      } catch {
        // Browser/OS may deny wake lock — non-fatal.
      }
    }

    void requestLock();
    const onVis = () => {
      if (document.visibilityState === "visible") void requestLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [keepAwake]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0] as
      | TorchCapableTrack
      | undefined;
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
      setTorchOn(false);
    }
  }

  async function handleSnap() {
    const video = videoRef.current;
    if (!video || !ready) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (captureMode === "page") {
      // Full frame — page grid matching crops pockets later.
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const quality = assessCaptureQuality(
        image.data,
        canvas.width,
        canvas.height,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
      );
      if (!blob) return;
      onCapture({
        blob,
        previewUrl: URL.createObjectURL(blob),
        quality,
      });
      return;
    }

    const cropW = Math.floor(canvas.width * 0.72);
    const cropH = Math.floor(cropW * 1.4);
    const sx = Math.floor((canvas.width - cropW) / 2);
    const sy = Math.floor((canvas.height - cropH) / 2);
    const cropped = document.createElement("canvas");
    cropped.width = cropW;
    cropped.height = Math.min(cropH, canvas.height - sy);
    const cctx = cropped.getContext("2d", { willReadFrequently: true });
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

    const image = cctx.getImageData(0, 0, cropped.width, cropped.height);
    const quality = assessCaptureQuality(
      image.data,
      cropped.width,
      cropped.height,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      cropped.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) return;
    onCapture({
      blob,
      previewUrl: URL.createObjectURL(blob),
      quality,
    });
  }

  return (
    <div className={collapsed ? "camera camera--collapsed" : "camera"}>
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
            {!collapsed &&
              (captureMode === "page" ? (
                <div
                  className="camera__guide camera__guide--page"
                  aria-hidden="true"
                  style={{
                    gridTemplateColumns: `repeat(${pageCols}, 1fr)`,
                    gridTemplateRows: `repeat(${pageRows}, 1fr)`,
                  }}
                >
                  {Array.from({ length: pageRows * pageCols }, (_, i) => (
                    <span key={i} className="camera__guide-cell" />
                  ))}
                </div>
              ) : (
                <div className="camera__guide" aria-hidden="true" />
              ))}
            {torchSupported && (
              <button
                type="button"
                className={
                  torchOn
                    ? "camera__torch camera__torch--on"
                    : "camera__torch"
                }
                onClick={() => void toggleTorch()}
                aria-pressed={torchOn}
                aria-label={torchOn ? "Turn torch off" : "Turn torch on"}
              >
                Torch
              </button>
            )}
            {overlay}
          </>
        )}

        {!collapsed && !overlay && (
          <button
            type="button"
            className="camera__shutter"
            onClick={() => void handleSnap()}
            disabled={disabled || !ready || Boolean(error)}
            aria-label={captureMode === "page" ? "Snap binder page" : "Snap card"}
          >
            <svg
              className="camera__shutter-icon"
              viewBox="0 0 24 24"
              width="28"
              height="28"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4.5 8.5h2.2l1.2-2h8.2l1.2 2h2.2a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-8a1.5 1.5 0 0 1 1.5-1.5Z" />
              <circle cx="12" cy="14" r="3.25" />
            </svg>
          </button>
        )}
      </div>
      {!collapsed && !overlay && (
        <p className="camera__tip">
          {captureMode === "page"
            ? "Fill the grid · flat page · even light"
            : "Fill the guide · keep the name sharp · hold steady"}
        </p>
      )}
    </div>
  );
}
