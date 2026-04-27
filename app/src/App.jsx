import { useState, useRef, useEffect, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { io } from "socket.io-client";
import HomePage from "./HomePage";
import FileExplorer from "./FileExplorer";
import Whiteboard from "./Whiteboard";
import axios from "axios";

const BACKEND_URL = "http://localhost:5000";

const USER_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FECA57", "#FF9FF3", "#54A0FF", "#5F27CD",
  "#00D2D3", "#FF9F43", "#10AC84", "#EE5A24"
];

// ─────────────────────────────────────────────────────────────────────────────
function EditorPage({ userName, roomId }) {
  // ── Core state ───────────────────────────────────────────────
  const [activeUsers, setActiveUsers] = useState([]);
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [currentFileId, setCurrentFileId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [openTabs, setOpenTabs] = useState([]);
  const [fileSystemTick, setFileSystemTick] = useState(0);

  // ── Whiteboard state ─────────────────────────────────────────
  const [isScribble, setIsScribble] = useState(false);
  const [wbTool, setWbTool] = useState("pen");    // "pen" | "eraser"
  const [wbColor, setWbColor] = useState("#f59e0b");
  const [wbSize, setWbSize] = useState(3);
  const [wbData, setWbData] = useState("[]");     // per-file strokes JSON

  // ── Refs ─────────────────────────────────────────────────────
  const editorRef = useRef(null);
  const socketRef = useRef(null);
  const isReceivingRef = useRef(false);
  const currentFileIdRef = useRef(null);
  const decorationsRef = useRef(null);
  const remoteCursorsRef = useRef({});
  const saveTimerRef = useRef(null);
  const wbSaveTimerRef = useRef(null);

  // Stable color per username
  const [userColor] = useState(() => {
    let h = 0;
    for (let i = 0; i < userName.length; i++) h = userName.charCodeAt(i) + ((h << 5) - h);
    return USER_COLORS[Math.abs(h) % USER_COLORS.length];
  });

  useEffect(() => { currentFileIdRef.current = currentFileId; }, [currentFileId]);

  // ── Socket setup ─────────────────────────────────────────────
  useEffect(() => {
    const socket = io(BACKEND_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("join-room", { roomId, userName, color: userColor });
    });

    socket.on("disconnect", () => setIsConnected(false));

    socket.on("user-joined", ({ socketId, userName: name, color }) => {
      setActiveUsers(prev => prev.find(u => u.socketId === socketId) ? prev : [...prev, { socketId, userName: name, color }]);
    });

    socket.on("room-users", setActiveUsers);

    socket.on("user-left", ({ socketId }) => {
      setActiveUsers(prev => prev.filter(u => u.socketId !== socketId));
      delete remoteCursorsRef.current[socketId];
      updateDecorations();
    });

    socket.on("code-update", ({ code, fileId }) => {
      if (fileId !== currentFileIdRef.current || !editorRef.current) return;
      const editor = editorRef.current;
      const pos = editor.getPosition();
      const sel = editor.getSelection();
      isReceivingRef.current = true;
      editor.getModel()?.setValue(code);
      if (pos) editor.setPosition(pos);
      if (sel) editor.setSelection(sel);
      isReceivingRef.current = false;
    });

    socket.on("sync-code", ({ code, fileId }) => {
      if (fileId !== currentFileIdRef.current || !editorRef.current) return;
      isReceivingRef.current = true;
      editorRef.current.getModel()?.setValue(code);
      isReceivingRef.current = false;
    });

    socket.on("cursor-update", ({ socketId, position, selection, userName: name, color, fileId }) => {
      if (fileId !== currentFileIdRef.current) return;
      remoteCursorsRef.current[socketId] = { position, selection, userName: name, color };
      updateDecorations();
    });

    socket.on("file-system-changed", () => setFileSystemTick(t => t + 1));

    return () => socket.disconnect();
  }, [roomId, userName, userColor]);

  // ── Monaco remote cursor decorations ─────────────────────────
  const updateDecorations = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const newDecs = [];
    for (const [sid, data] of Object.entries(remoteCursorsRef.current)) {
      const { position, selection, userName: name, color } = data;
      if (!position) continue;
      const cls = `rc-${sid.replace(/[^a-zA-Z0-9]/g, "")}`;
      newDecs.push({
        range: { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column + 1 },
        options: { className: `${cls}-cursor`, hoverMessage: { value: name }, stickiness: 1 }
      });
      if (selection && (selection.startLineNumber !== selection.endLineNumber || selection.startColumn !== selection.endColumn)) {
        newDecs.push({
          range: { startLineNumber: selection.startLineNumber, startColumn: selection.startColumn, endLineNumber: selection.endLineNumber, endColumn: selection.endColumn },
          options: { className: `${cls}-selection`, stickiness: 1 }
        });
      }
    }

    if (editor.createDecorationsCollection) {
      if (decorationsRef.current?.clear) decorationsRef.current.clear();
      decorationsRef.current = editor.createDecorationsCollection(newDecs);
    } else {
      decorationsRef.current = editor.deltaDecorations(
        Array.isArray(decorationsRef.current) ? decorationsRef.current : [], newDecs
      );
    }
  }, []);

  // ── Load file ────────────────────────────────────────────────
  const loadFile = useCallback(async (id) => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/files/${id}`);
      const file = res.data;

      setCurrentFileId(id);
      currentFileIdRef.current = id;
      setWbData(file.whiteboardData || "[]");

      setOpenTabs(prev => prev.find(t => t.id === id) ? prev : [...prev, { id, name: file.name }]);

      if (editorRef.current) {
        isReceivingRef.current = true;
        editorRef.current.getModel()?.setValue(file.content || "");
        isReceivingRef.current = false;
      }

      // Clear remote cursors when switching file
      remoteCursorsRef.current = {};
      updateDecorations();

      socketRef.current?.emit("open-file", { roomId, fileId: id });
    } catch (err) {
      console.error("loadFile error:", err);
    }
  }, [roomId, updateDecorations]);

  // ── Code change ──────────────────────────────────────────────
  const handleEditorChange = useCallback((value) => {
    if (isReceivingRef.current || !currentFileIdRef.current) return;
    const fileId = currentFileIdRef.current;

    socketRef.current?.emit("code-change", { roomId, fileId, code: value || "" });

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try { await axios.put(`${BACKEND_URL}/api/files/${fileId}`, { content: value || "" }); }
      catch (err) { console.error("Auto-save failed:", err); }
    }, 1000);
  }, [roomId]);

  // ── Close tab ────────────────────────────────────────────────
  const closeTab = (id, e) => {
    e.stopPropagation();
    const newTabs = openTabs.filter(t => t.id !== id);
    setOpenTabs(newTabs);
    if (currentFileId === id) {
      if (newTabs.length > 0) {
        loadFile(newTabs[newTabs.length - 1].id);
      } else {
        setCurrentFileId(null);
        currentFileIdRef.current = null;
        editorRef.current?.getModel()?.setValue("");
      }
    }
  };

  // ── Whiteboard change ────────────────────────────────────────
  const handleWbChange = useCallback((data) => {
    if (!currentFileIdRef.current) return;
    const fileId = currentFileIdRef.current;
    setWbData(data);
    clearTimeout(wbSaveTimerRef.current);
    wbSaveTimerRef.current = setTimeout(async () => {
      try { await axios.put(`${BACKEND_URL}/api/files/${fileId}`, { whiteboardData: data }); }
      catch (err) { console.error("Whiteboard save failed:", err); }
    }, 1500);
  }, []);

  // ── Clear whiteboard for all ─────────────────────────────────
  const clearWhiteboard = () => {
    if (!currentFileIdRef.current) return;
    socketRef.current?.emit("whiteboard-clear", { fileId: currentFileIdRef.current });
    setWbData("[]");
    axios.put(`${BACKEND_URL}/api/files/${currentFileIdRef.current}`, { whiteboardData: "[]" }).catch(() => {});
  };

  // ── Cursor sync ──────────────────────────────────────────────
  const handleCursorChange = useCallback((event) => {
    if (!currentFileIdRef.current || !socketRef.current) return;
    const pos = event.position;
    const sel = event.selection;
    socketRef.current.emit("cursor-move", {
      roomId, fileId: currentFileIdRef.current,
      position: { lineNumber: pos.lineNumber, column: pos.column },
      selection: sel ? { startLineNumber: sel.startLineNumber, startColumn: sel.startColumn, endLineNumber: sel.endLineNumber, endColumn: sel.endColumn } : null,
      userName, color: userColor
    });
  }, [roomId, userName, userColor]);

  const handleEditorMount = (editor) => {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition(handleCursorChange);
    editor.onDidChangeCursorSelection(handleCursorChange);
  };

  // ── Run code ─────────────────────────────────────────────────
  const runCode = async () => {
    if (!editorRef.current) return;
    setOutput("Running...");
    try {
      const res = await fetch(`${BACKEND_URL}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: editorRef.current.getValue() }),
      });
      const data = await res.json();
      setOutput(data.output);
    } catch (err) {
      setOutput(`Error: ${err.message || "Backend is offline."}`);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/?room=${roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Dynamic cursor CSS ───────────────────────────────────────
  const cursorCSS = activeUsers.map(u => {
    const s = u.socketId.replace(/[^a-zA-Z0-9]/g, "");
    return `.rc-${s}-cursor { border-left: 2px solid ${u.color} !important; }
.rc-${s}-selection { background-color: ${u.color}33 !important; }`;
  }).join("\n");

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#1e1e1e", color: "white", fontFamily: "Inter, sans-serif" }}>
      <style>{`
        ${cursorCSS}
        .users-container { position: relative; cursor: pointer; }
        .users-dropdown { position: absolute; top: 100%; right: 0; margin-top: 8px; background: #252526; border: 1px solid #3a3a3a; border-radius: 8px; padding: 8px 0; min-width: 160px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); opacity: 0; visibility: hidden; transform: translateY(-10px); transition: all 0.2s ease; z-index: 100; }
        .users-container:hover .users-dropdown { opacity: 1; visibility: visible; transform: translateY(0); }
        .u-row { display: flex; align-items: center; gap: 10px; padding: 6px 16px; }
        .u-row:hover { background: #2a2a2a; }
        .tab-bar::-webkit-scrollbar { height: 4px; }
        .tab-bar::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
        .wb-btn { background: transparent; border: 1px solid #444; border-radius: 5px; color: #ccc; padding: 3px 10px; cursor: pointer; font-size: 12px; transition: all 0.15s; }
        .wb-btn:hover { background: #333; }
        .wb-btn.active { background: #f59e0b22; border-color: #f59e0b; color: #f59e0b; }
      `}</style>

      {/* ── Navbar ──────────────────────────────────────────────── */}
      <div style={{ padding: "8px 20px", background: "#161616", borderBottom: "1px solid #2a2a2a", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.4)", zIndex: 10, gap: "12px", flexWrap: "wrap" }}>

        {/* Left */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span style={{ fontWeight: "800", fontSize: "1rem", background: "linear-gradient(135deg,#fff,#a0c4ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            ⌨️ ColabCode
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#252526", padding: "4px 12px", borderRadius: "6px", border: "1px solid #333" }}>
            <span style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "1px" }}>Room</span>
            <span style={{ fontWeight: "700", color: "#e0e0e0", fontFamily: "Consolas, monospace" }}>{roomId}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: isConnected ? "#00d084" : "#e74c3c", boxShadow: isConnected ? "0 0 6px #00d08466" : "none" }} />
            <span style={{ fontSize: "11px", color: "#555" }}>{isConnected ? "Live" : "Connecting..."}</span>
          </div>

          {/* User avatars */}
          <div className="users-container" style={{ display: "flex", alignItems: "center", gap: "8px", background: "#252526", padding: "4px 12px", borderRadius: "20px", border: "1px solid #333" }}>
            <div style={{ display: "flex" }}>
              <div title={userName} style={{ width: "26px", height: "26px", borderRadius: "50%", background: userColor, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", border: "2px solid #161616", fontSize: "12px", zIndex: 999 }}>
                {userName.charAt(0).toUpperCase()}
              </div>
              {activeUsers.map((u, i) => (
                <div key={u.socketId} title={u.userName} style={{ width: "26px", height: "26px", borderRadius: "50%", background: u.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", border: "2px solid #161616", fontSize: "12px", marginLeft: "-8px", zIndex: activeUsers.length - i }}>
                  {u.userName.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
            <span style={{ fontSize: "12px", color: "#555" }}>{activeUsers.length + 1} online</span>
            <div className="users-dropdown">
              <div style={{ padding: "0 16px 6px", fontSize: "11px", color: "#555", borderBottom: "1px solid #333", marginBottom: "4px" }}>CONNECTED ({activeUsers.length + 1})</div>
              <div className="u-row"><div style={{ width: "9px", height: "9px", borderRadius: "50%", background: userColor }} /><span style={{ fontSize: "13px", color: "#e0e0e0" }}>{userName} (you)</span></div>
              {activeUsers.map(u => (
                <div key={"dd" + u.socketId} className="u-row"><div style={{ width: "9px", height: "9px", borderRadius: "50%", background: u.color }} /><span style={{ fontSize: "13px", color: "#e0e0e0" }}>{u.userName}</span></div>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={() => setIsScribble(s => !s)}
            style={{ background: isScribble ? "#f59e0b" : "transparent", color: isScribble ? "#fff" : "#ccc", border: `1px solid ${isScribble ? "#f59e0b" : "#444"}`, padding: "5px 14px", cursor: "pointer", borderRadius: "6px", fontWeight: "600", fontSize: "13px" }}
          >✏️ {isScribble ? "Exit Scribble" : "Scribble"}</button>

          <button onClick={copyLink} style={{ background: "transparent", color: copied ? "#00d084" : "#666", border: `1px solid ${copied ? "#00d08440" : "#333"}`, padding: "5px 14px", cursor: "pointer", borderRadius: "6px", fontWeight: "600", fontSize: "13px" }}>
            {copied ? "✓ Copied" : "Copy Link"}
          </button>

          <button onClick={runCode} style={{ background: "#0693e3", color: "white", border: "none", padding: "5px 18px", cursor: "pointer", borderRadius: "6px", fontWeight: "600", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}
            onMouseOver={e => e.currentTarget.style.background = "#057ab8"}
            onMouseOut={e => e.currentTarget.style.background = "#0693e3"}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            Run
          </button>
        </div>
      </div>

      {/* ── Whiteboard toolbar (shown when Scribble is ON) ──────── */}
      {isScribble && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#1a1a1a", borderBottom: "1px solid #2a2a2a", padding: "6px 20px" }}>
          <button className={`wb-btn ${wbTool === "pen" ? "active" : ""}`} onClick={() => setWbTool("pen")}>🖊 Pen</button>
          <button className={`wb-btn ${wbTool === "eraser" ? "active" : ""}`} onClick={() => setWbTool("eraser")}>🧹 Eraser</button>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#888" }}>
            🎨
            <input type="color" value={wbColor} onChange={e => setWbColor(e.target.value)} style={{ width: "28px", height: "22px", border: "none", padding: 0, cursor: "pointer", borderRadius: "4px" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#888" }}>
            Size
            <input type="range" min="1" max="20" value={wbSize} onChange={e => setWbSize(Number(e.target.value))} style={{ width: "80px" }} />
            <span style={{ color: "#ccc" }}>{wbSize}px</span>
          </label>
          <button className="wb-btn" onClick={clearWhiteboard} style={{ borderColor: "#e74c3c", color: "#e74c3c" }}>🗑 Clear All</button>
        </div>
      )}

      {/* ── Main Content ─────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* File Explorer */}
        <FileExplorer roomId={roomId} onFileSelect={loadFile} refreshTick={fileSystemTick} />

        {/* Editor Column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid #2a2a2a" }}>

          {/* Tab Bar */}
          <div className="tab-bar" style={{ display: "flex", background: "#252526", borderBottom: "1px solid #2a2a2a", overflowX: "auto", minHeight: "35px", flexShrink: 0 }}>
            {openTabs.map(tab => (
              <div
                key={tab.id}
                onClick={() => loadFile(tab.id)}
                style={{ padding: "7px 16px", fontSize: "12px", color: currentFileId === tab.id ? "#fff" : "#9cdcfe", fontFamily: "Consolas, monospace", display: "flex", alignItems: "center", gap: "8px", background: currentFileId === tab.id ? "#1e1e1e" : "#2d2d2d", cursor: "pointer", borderTop: currentFileId === tab.id ? "2px solid #007fd4" : "2px solid transparent", borderRight: "1px solid #2a2a2a", whiteSpace: "nowrap", flexShrink: 0 }}
              >
                <span>📄 {tab.name}</span>
                <span
                  onClick={e => closeTab(tab.id, e)}
                  style={{ color: "#888", fontWeight: "bold", padding: "0 3px", borderRadius: "3px" }}
                  onMouseOver={e => e.target.style.background = "#444"}
                  onMouseOut={e => e.target.style.background = "transparent"}
                >✕</span>
              </div>
            ))}
          </div>

          {/* Editor + Whiteboard overlay */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {!currentFileId && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#3a3a3a", flexDirection: "column", gap: "12px", zIndex: 1 }}>
                <span style={{ fontSize: "32px" }}>📁</span>
                <span style={{ fontSize: "14px" }}>Select a file from the explorer to start coding</span>
              </div>
            )}

            {/* Canvas Whiteboard (only when scribble mode is on AND a file is open) */}
            {isScribble && currentFileId && (
              <Whiteboard
                roomId={roomId}
                fileId={currentFileId}
                socket={socketRef.current}
                userColor={userColor}
                initialData={wbData}
                onChange={handleWbChange}
                tool={wbTool}
                color={wbColor}
                lineWidth={wbSize}
              />
            )}

            <Editor
              height="100%"
              theme="vs-dark"
              language="cpp"
              onMount={handleEditorMount}
              onChange={handleEditorChange}
              options={{
                fontSize: 15,
                minimap: { enabled: false },
                automaticLayout: true,
                fontFamily: "'Fira Code', Consolas, monospace",
                fontLigatures: true,
                cursorBlinking: "smooth",
                smoothScrolling: true,
                readOnly: !currentFileId
              }}
            />
          </div>
        </div>

        {/* Output Panel */}
        <div style={{ width: "340px", background: "#111", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1a1a1a", fontSize: "11px", color: "#444", letterSpacing: "1.5px", fontWeight: "600" }}>OUTPUT</div>
          <pre style={{ flex: 1, color: "#d4d4d4", whiteSpace: "pre-wrap", fontFamily: "Consolas, monospace", fontSize: "14px", padding: "16px", margin: 0, overflowY: "auto" }}>
            {output || <span style={{ color: "#3a3a3a" }}>Run your code to see output here...</span>}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoomId = urlParams.get("room");
    if (urlRoomId && !session) {
      const name = prompt(`Enter your username to join room: ${urlRoomId}`);
      if (name?.trim()) setSession({ userName: name.trim(), roomId: urlRoomId });
    }
  }, [session]);

  if (!session) {
    return (
      <HomePage onJoin={({ userName, roomId }) => {
        window.history.pushState({}, "", "?room=" + roomId);
        setSession({ userName, roomId });
      }} />
    );
  }

  return <EditorPage userName={session.userName} roomId={session.roomId} />;
}
