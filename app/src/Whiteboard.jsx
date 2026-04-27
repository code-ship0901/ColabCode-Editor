import { useRef, useEffect, useCallback } from "react";

/**
 * Whiteboard — transparent canvas overlay on top of Monaco editor.
 * Features: Pen, Eraser, Color picker, Brush size, Clear All.
 * Syncs strokes in real time via Socket.io.
 */
export default function Whiteboard({
  roomId, fileId, socket, userColor, initialData, onChange,
  tool, color, lineWidth
}) {
  const canvasRef = useRef(null);
  const strokesRef = useRef([]);      // All strokes for this file
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef([]);

  // ── Initialize canvas size and load existing strokes ─────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      // Save snapshot, resize, then restore
      const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      redrawAll();
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Reload strokes when file changes ─────────────────────────
  useEffect(() => {
    try {
      strokesRef.current = JSON.parse(initialData || "[]");
    } catch {
      strokesRef.current = [];
    }
    redrawAll();
  }, [initialData, fileId]);

  // ── Socket: receive new stroke from a collaborator ────────────
  useEffect(() => {
    if (!socket) return;

    const onUpdate = ({ stroke }) => {
      strokesRef.current.push(stroke);
      drawStroke(stroke);
    };

    const onClear = () => {
      strokesRef.current = [];
      const canvas = canvasRef.current;
      if (canvas) canvasRef.current.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    };

    const onSync = ({ data }) => {
      try {
        strokesRef.current = JSON.parse(data || "[]");
        redrawAll();
      } catch {}
    };

    socket.on("whiteboard-update", onUpdate);
    socket.on("whiteboard-clear", onClear);
    socket.on("sync-whiteboard", onSync);

    return () => {
      socket.off("whiteboard-update", onUpdate);
      socket.off("whiteboard-clear", onClear);
      socket.off("sync-whiteboard", onSync);
    };
  }, [socket, fileId]);

  // ── Draw a single stroke onto canvas ─────────────────────────
  const drawStroke = (stroke) => {
    const canvas = canvasRef.current;
    if (!canvas || !stroke.points || stroke.points.length < 2) return;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.strokeStyle = stroke.eraser ? "rgba(0,0,0,1)" : stroke.color;
    ctx.lineWidth = stroke.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (stroke.eraser) ctx.globalCompositeOperation = "destination-out";
    else ctx.globalCompositeOperation = "source-over";
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  };

  // ── Redraw all strokes ────────────────────────────────────────
  const redrawAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    strokesRef.current.forEach(drawStroke);
  };

  // ── Get canvas-relative position ─────────────────────────────
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  // ── Mouse / Touch event handlers ──────────────────────────────
  const onPointerDown = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    const pos = getPos(e);
    currentStrokeRef.current = [pos];
  };

  const onPointerMove = (e) => {
    e.preventDefault();
    if (!drawingRef.current) return;
    const pos = getPos(e);
    currentStrokeRef.current.push(pos);

    // Live draw current stroke
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pts = currentStrokeRef.current;
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = tool === "eraser" ? "rgba(0,0,0,1)" : color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  };

  const onPointerUp = (e) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;

    const stroke = {
      points: currentStrokeRef.current,
      color,
      lineWidth,
      eraser: tool === "eraser"
    };

    strokesRef.current.push(stroke);
    currentStrokeRef.current = [];

    // Emit to collaborators
    if (socket) {
      socket.emit("whiteboard-draw", { fileId, stroke });
      socket.emit("whiteboard-save", { fileId, data: JSON.stringify(strokesRef.current) });
    }

    // Notify parent for DB persistence
    if (onChange) onChange(JSON.stringify(strokesRef.current));
  };

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        cursor: tool === "eraser" ? "cell" : "crosshair",
        touchAction: "none",
      }}
      onMouseDown={onPointerDown}
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onMouseLeave={onPointerUp}
      onTouchStart={onPointerDown}
      onTouchMove={onPointerMove}
      onTouchEnd={onPointerUp}
    />
  );
}
