/**
 * ============================================================
 * ColabCode - Main App
 * FILE: app/src/App.jsx
 * ============================================================
 * 
 * What changed from original:
 * - Replaced y-webrtc/yjs with Socket.io for real-time sync
 *   (Socket.io is more reliable and beginner-friendly)
 * - Added real cursor position sync using Monaco decorations
 * - Kept all existing UI (navbar, output panel, file explorer)
 * - Added proper room joining with URL support
 */

import { useState, useRef, useEffect, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { io } from "socket.io-client";
import HomePage from "./HomePage";
import FileExplorer from "./FileExplorer";
import axios from "axios";

// ─── Constants ───────────────────────────────────────────────
const BACKEND_URL = "http://localhost:5000";

// Color palette for users - each gets a unique color
const USER_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FECA57", "#FF9FF3", "#54A0FF", "#5F27CD",
  "#00D2D3", "#FF9F43", "#10AC84", "#EE5A24"
];

// ─── EditorPage Component ─────────────────────────────────────
function EditorPage({ userName, roomId }) {
  // ── State ──────────────────────────────────────────────────
  const [activeUsers, setActiveUsers] = useState([]);   // People in room
  const [output, setOutput] = useState("");              // C++ run output
  const [copied, setCopied] = useState(false);           // Copy link feedback
  const [currentFileId, setCurrentFileId] = useState(null);  // Open file ID
  const [fileName, setFileName] = useState("");          // Open file name
  const [isConnected, setIsConnected] = useState(false); // Socket connected?
  const [openTabs, setOpenTabs] = useState([]);          // Array of {id, name} open tabs
  const [fileSystemTick, setFileSystemTick] = useState(0); // Trigger file tree refresh

  // ── Refs (don't cause re-renders) ──────────────────────────
  const editorRef = useRef(null);           // Monaco editor instance
  const socketRef = useRef(null);           // Socket.io connection
  const isReceivingRef = useRef(false);     // Prevent echo when receiving code
  const currentFileIdRef = useRef(null);    // Current file (for socket events)
  const decorationsRef = useRef([]);        // Monaco cursor decorations
  const remoteCursorsRef = useRef({});      // Other users' cursor positions
  const saveTimerRef = useRef(null);        // Auto-save debounce timer

  // ── Assign this user a stable color ────────────────────────
  const [userColor] = useState(() => {
    // Pick color based on name hash so same user always gets same color
    let hash = 0;
    for (let i = 0; i < userName.length; i++) {
      hash = userName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
  });

  // Keep ref in sync with state
  useEffect(() => {
    currentFileIdRef.current = currentFileId;
  }, [currentFileId]);

  // ── Socket.io Setup ─────────────────────────────────────────
  useEffect(() => {
    // Create socket connection to backend
    const socket = io(BACKEND_URL, {
      transports: ["websocket", "polling"]
    });
    socketRef.current = socket;

    // Connected to server
    socket.on("connect", () => {
      console.log("✅ Connected to Socket.io:", socket.id);
      setIsConnected(true);

      // Join the collaboration room
      socket.emit("join-room", {
        roomId,
        userName,
        color: userColor
      });
    });

    socket.on("disconnect", () => {
      console.log("❌ Disconnected from Socket.io");
      setIsConnected(false);
    });

    // Someone else joined the room
    socket.on("user-joined", ({ socketId, userName: name, color }) => {
      console.log(`👤 ${name} joined`);
      setActiveUsers(prev => {
        if (prev.find(u => u.socketId === socketId)) return prev;
        return [...prev, { socketId, userName: name, color }];
      });
    });

    // Existing users in room (sent when you first join)
    socket.on("room-users", (users) => {
      setActiveUsers(users);
    });

    // Someone left the room
    socket.on("user-left", ({ socketId }) => {
      setActiveUsers(prev => prev.filter(u => u.socketId !== socketId));
      // Remove their cursor decoration
      delete remoteCursorsRef.current[socketId];
      updateDecorations();
    });

    // ── Code sync from another user ─────────────────────────
    // Only applies if we have the same file open
    socket.on("code-update", ({ code, fileId }) => {
      if (fileId !== currentFileIdRef.current) return;
      if (!editorRef.current) return;

      // Set flag so our onChange doesn't re-broadcast this
      isReceivingRef.current = true;

      const editor = editorRef.current;
      const model = editor.getModel();
      if (!model) return;

      // Save cursor position before update
      const position = editor.getPosition();
      const selection = editor.getSelection();

      // Apply the code change
      model.setValue(code);

      // Restore cursor position (so it doesn't jump)
      if (position) editor.setPosition(position);
      if (selection) editor.setSelection(selection);

      isReceivingRef.current = false;
    });

    // Initial code sync when you open a file
    socket.on("sync-code", ({ code, fileId }) => {
      if (fileId !== currentFileIdRef.current) return;
      if (!editorRef.current) return;

      isReceivingRef.current = true;
      editorRef.current.getModel()?.setValue(code);
      isReceivingRef.current = false;
    });

    // ── Cursor update from another user ─────────────────────
    socket.on("cursor-update", ({ socketId, position, selection, userName: name, color, fileId }) => {
      if (fileId !== currentFileIdRef.current) return;

      // Store this user's cursor data
      remoteCursorsRef.current[socketId] = { position, selection, userName: name, color };

      // Update Monaco decorations to show cursor
      updateDecorations();
    });

    // File system was updated by someone
    socket.on("file-system-changed", () => {
      setFileSystemTick(t => t + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId, userName, userColor]);

  // ── Update Monaco Decorations (Remote Cursors) ─────────────
  /**
   * Monaco decorations let us draw custom UI in the editor.
   * We use them to show colored cursor lines and selection
   * highlights for each remote user.
   */
  const updateDecorations = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const newDecorations = [];

    for (const [socketId, data] of Object.entries(remoteCursorsRef.current)) {
      const { position, selection, userName: name, color } = data;
      if (!position) continue;

      // Create a unique CSS class for this user's color
      // We inject styles dynamically in the style tag below
      const className = `remote-cursor-${socketId.replace(/[^a-zA-Z0-9]/g, '')}`;

      // Cursor line decoration (the blinking line)
      newDecorations.push({
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column + 1  // +1 to make it visible
        },
        options: {
          className: `${className}-cursor`,
          hoverMessage: { value: name },
          stickiness: 1  // Stays with text as it's typed
        }
      });

      // Selection decoration (highlighted text range)
      if (selection &&
        (selection.startLineNumber !== selection.endLineNumber ||
          selection.startColumn !== selection.endColumn)) {
        newDecorations.push({
          range: {
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn
          },
          options: {
            className: `${className}-selection`,
            stickiness: 1
          }
        });
      }
    }

    // Apply decorations to Monaco, replacing old ones
    if (editor.createDecorationsCollection) {
      if (decorationsRef.current && decorationsRef.current.clear) {
        decorationsRef.current.clear();
      }
      decorationsRef.current = editor.createDecorationsCollection(newDecorations);
    } else {
      // Fallback for older Monaco versions
      decorationsRef.current = editor.deltaDecorations(
        Array.isArray(decorationsRef.current) ? decorationsRef.current : [],
        newDecorations
      );
    }
  }, []);

  // ── Load File from DB ────────────────────────────────────────
  const loadFile = async (id) => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/files/${id}`);
      const file = res.data;

      setCurrentFileId(id);
      setFileName(file.name);
      currentFileIdRef.current = id;

      setOpenTabs(prev => {
        if (prev.find(t => t.id === id)) return prev;
        return [...prev, { id, name: file.name }];
      });

      // Set editor content
      if (editorRef.current) {
        isReceivingRef.current = true;
        editorRef.current.getModel()?.setValue(file.content || "");
        isReceivingRef.current = false;
      }

      // Tell Socket.io server we opened this file
      // Server will send us the latest code if others have typed since last DB save
      if (socketRef.current) {
        socketRef.current.emit("open-file", { roomId, fileId: id });
      }

    } catch (err) {
      console.error("Failed to load file:", err);
    }
  };

  // ── Handle Editor Code Changes ───────────────────────────────
  const handleEditorChange = useCallback((value) => {
    // If we're receiving code from a remote user, don't re-broadcast
    if (isReceivingRef.current) return;
    if (!currentFileIdRef.current) return;

    const fileId = currentFileIdRef.current;

    // 1. Broadcast code change to other users in real-time
    if (socketRef.current) {
      socketRef.current.emit("code-change", {
        roomId,
        fileId,
        code: value || ""
      });
    }

    // 2. Auto-save to MongoDB after 1 second of no typing
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await axios.put(`${BACKEND_URL}/api/files/${fileId}`, { content: value || "" });
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }, 1000);
  }, [roomId]);

  // ── Handle Closing a Tab ─────────────────────────────────────
  const closeTab = (id, e) => {
    e.stopPropagation();
    const newTabs = openTabs.filter(t => t.id !== id);
    setOpenTabs(newTabs);
    
    if (currentFileId === id) {
      if (newTabs.length > 0) {
        loadFile(newTabs[newTabs.length - 1].id);
      } else {
        setCurrentFileId(null);
        setFileName("");
        if (editorRef.current) {
          isReceivingRef.current = true;
          editorRef.current.getModel()?.setValue("");
          isReceivingRef.current = false;
        }
      }
    }
  };

  // ── Handle Cursor Position Changes ───────────────────────────
  const handleCursorChange = useCallback((event) => {
    if (!currentFileIdRef.current || !socketRef.current) return;

    const position = event.position;
    const selection = event.selection;

    socketRef.current.emit("cursor-move", {
      roomId,
      fileId: currentFileIdRef.current,
      position: {
        lineNumber: position.lineNumber,
        column: position.column
      },
      selection: selection ? {
        startLineNumber: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLineNumber: selection.endLineNumber,
        endColumn: selection.endColumn
      } : null,
      userName,
      color: userColor
    });
  }, [roomId, userName, userColor]);

  // ── Monaco Editor Mount ───────────────────────────────────────
  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;

    // Listen for cursor position changes
    editor.onDidChangeCursorPosition(handleCursorChange);
    editor.onDidChangeCursorSelection(handleCursorChange);
  };

  // ── Copy Room Link ────────────────────────────────────────────
  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/?room=${roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Run C++ Code ──────────────────────────────────────────────
  const runCode = async () => {
    if (!editorRef.current) return;
    setOutput("Running...");
    try {
      const res = await fetch(`${BACKEND_URL}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: editorRef.current.getValue() }),
      });
      const data = await res.json();
      setOutput(data.output);
    } catch (err) {
      setOutput(`Error: ${err.message || "Backend is offline."}`);
    }
  };

  // ── Generate Dynamic CSS for Remote Cursors ───────────────────
  const remoteCursorCSS = activeUsers.map(u => {
    const safeId = u.socketId.replace(/[^a-zA-Z0-9]/g, '');
    return `
      /* Cursor line for ${u.userName} */
      .remote-cursor-${safeId}-cursor {
        border-left: 2px solid ${u.color} !important;
        background: transparent !important;
      }
      /* Selection highlight for ${u.userName} */
      .remote-cursor-${safeId}-selection {
        background-color: ${u.color}33 !important;
      }
    `;
  }).join("\n");

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "#1e1e1e",
      color: "white"
    }}>
      {/* Dynamic CSS for remote cursors */}
      <style>{`
        ${remoteCursorCSS}

        /* Floating name tag above each remote cursor */
        .remote-cursor-label {
          position: absolute;
          font-size: 11px;
          padding: 1px 5px;
          border-radius: 3px;
          color: white;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          white-space: nowrap;
          pointer-events: none;
          z-index: 10;
          top: -18px;
          left: -2px;
        }

        .users-container { position: relative; cursor: pointer; }
        .users-dropdown {
          position: absolute; top: 100%; right: 0; margin-top: 10px;
          background: #252526; border: 1px solid #3a3a3a; border-radius: 8px;
          padding: 8px 0; min-width: 160px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          opacity: 0; visibility: hidden;
          transform: translateY(-10px);
          transition: all 0.2s ease; z-index: 20;
        }
        .users-container:hover .users-dropdown {
          opacity: 1; visibility: visible; transform: translateY(0);
        }
        .user-row { display: flex; align-items: center; gap: 10px; padding: 6px 16px; }
        .user-row:hover { background: #2a2a2a; }
      `}</style>

      {/* ── Navbar ─────────────────────────────────────────── */}
      <div style={{
        padding: "10px 20px",
        background: "#161616",
        borderBottom: "1px solid #2a2a2a",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
        zIndex: 10
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {/* Logo */}
          <span style={{
            fontWeight: "800", fontSize: "1rem", letterSpacing: "-0.3px",
            background: "linear-gradient(135deg, #fff, #a0c4ff)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
          }}>
            ⌨️ ColabCode
          </span>

          {/* Room ID badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "#252526", padding: "5px 12px",
            borderRadius: "6px", border: "1px solid #333"
          }}>
            <span style={{ fontSize: "11px", color: "#555", textTransform: "uppercase", letterSpacing: "1px" }}>Room</span>
            <span style={{ fontWeight: "700", color: "#e0e0e0", letterSpacing: "1px", fontFamily: "Consolas, monospace" }}>{roomId}</span>
          </div>

          {/* Connection status dot */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{
              width: "8px", height: "8px", borderRadius: "50%",
              background: isConnected ? "#00d084" : "#e74c3c",
              boxShadow: isConnected ? "0 0 6px #00d08466" : "none"
            }} />
            <span style={{ fontSize: "11px", color: "#555" }}>
              {isConnected ? "Live" : "Connecting..."}
            </span>
          </div>

          {/* Active users avatars with dropdown */}
          <div className="users-container" style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "#252526", padding: "4px 12px",
            borderRadius: "20px", border: "1px solid #333"
          }}>
            <div style={{ display: "flex" }}>
              {/* Your own avatar first */}
              <div title={userName} style={{
                width: "28px", height: "28px", borderRadius: "50%",
                background: userColor, display: "flex",
                alignItems: "center", justifyContent: "center",
                fontWeight: "700", border: "2px solid #161616", fontSize: "13px",
                zIndex: 999,
              }}>
                {userName.charAt(0).toUpperCase()}
              </div>
              {/* Other users */}
              {activeUsers.map((u, i) => (
                <div key={u.socketId} title={u.userName} style={{
                  width: "28px", height: "28px", borderRadius: "50%",
                  background: u.color, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontWeight: "700", border: "2px solid #161616", fontSize: "13px",
                  marginLeft: "-8px", zIndex: activeUsers.length - i,
                }}>
                  {u.userName.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
            <span style={{ fontSize: "12px", color: "#555" }}>
              {activeUsers.length + 1} online
            </span>

            {/* Dropdown list */}
            <div className="users-dropdown">
              <div style={{
                padding: "0 16px 8px", fontSize: "11px", color: "#555",
                borderBottom: "1px solid #333", marginBottom: "4px", letterSpacing: "0.5px"
              }}>
                CONNECTED ({activeUsers.length + 1})
              </div>
              {/* You */}
              <div className="user-row">
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: userColor }} />
                <span style={{ fontSize: "13px", color: "#e0e0e0" }}>{userName} (you)</span>
              </div>
              {/* Others */}
              {activeUsers.map(u => (
                <div key={"dd-" + u.socketId} className="user-row">
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: u.color }} />
                  <span style={{ fontSize: "13px", color: "#e0e0e0" }}>{u.userName}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right buttons */}
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={copyLink} style={{
            background: "transparent",
            color: copied ? "#00d084" : "#666",
            border: `1px solid ${copied ? "#00d08440" : "#333"}`,
            padding: "6px 14px", cursor: "pointer", borderRadius: "6px",
            fontWeight: "600", fontSize: "13px", fontFamily: "Inter, sans-serif",
            transition: "all 0.15s"
          }}>
            {copied ? "✓ Copied" : "Copy Link"}
          </button>
          <button onClick={runCode} style={{
            background: "#0693e3", color: "white", border: "none",
            padding: "6px 18px", cursor: "pointer", borderRadius: "6px",
            fontWeight: "600", fontSize: "13px", fontFamily: "Inter, sans-serif",
            display: "flex", alignItems: "center", gap: "6px", transition: "background 0.15s"
          }}
            onMouseOver={e => e.currentTarget.style.background = "#057ab8"}
            onMouseOut={e => e.currentTarget.style.background = "#0693e3"}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            Run Code
          </button>
        </div>
      </div>

      {/* ── Main Content ────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* File Explorer Sidebar */}
        <FileExplorer roomId={roomId} onFileSelect={loadFile} refreshTick={fileSystemTick} />

        {/* Code Editor */}
        <div style={{
          flex: 1,
          borderRight: "1px solid #2a2a2a",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}>
          {/* File Tabs */}
          <div style={{
            display: "flex",
            background: "#1e1e1e",
            borderBottom: "1px solid #2a2a2a",
            overflowX: "auto",
            minHeight: "35px"
          }}>
            {openTabs.map(tab => (
              <div 
                key={tab.id}
                onClick={() => loadFile(tab.id)}
                style={{
                  padding: "8px 16px",
                  fontSize: "12px",
                  color: currentFileId === tab.id ? "#fff" : "#9cdcfe",
                  fontFamily: "Consolas, monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: currentFileId === tab.id ? "#1e1e1e" : "#2d2d2d",
                  cursor: "pointer",
                  borderTop: currentFileId === tab.id ? "2px solid #007fd4" : "2px solid transparent",
                  borderRight: "1px solid #2a2a2a"
                }}
              >
                <span>📄 {tab.name}</span>
                <span 
                  onClick={(e) => closeTab(tab.id, e)}
                  style={{ 
                    color: "#888", fontSize: "14px", fontWeight: "bold", marginLeft: "4px", padding: "0 4px", borderRadius: "4px" 
                  }}
                  onMouseOver={e => e.target.style.background = "#444"}
                  onMouseOut={e => e.target.style.background = "transparent"}
                >
                  ✕
                </span>
              </div>
            ))}
          </div>

          {/* Monaco Editor */}
          <div style={{ flex: 1, position: "relative" }}>
            {!currentFileId && (
              <div style={{
                position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
                color: "#3a3a3a", fontSize: "14px", zIndex: 1,
                flexDirection: "column", gap: "12px"
              }}>
                <span style={{ fontSize: "32px" }}>📁</span>
                <span>Select a file from the explorer to start coding</span>
              </div>
            )}
            <Editor
              height="100%"
              theme="vs-dark"
              language="cpp"
              onMount={handleEditorDidMount}
              onChange={handleEditorChange}
              options={{
                fontSize: 15,
                minimap: { enabled: false },
                automaticLayout: true,
                fontFamily: "'Fira Code', Consolas, monospace",
                fontLigatures: true,
                cursorBlinking: "smooth",
                smoothScrolling: true,
                readOnly: !currentFileId  // Read-only until a file is selected
              }}
            />
          </div>
        </div>

        {/* Output Panel */}
        <div style={{ width: "360px", background: "#111", display: "flex", flexDirection: "column" }}>
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid #1a1a1a",
            fontSize: "11px", color: "#444",
            letterSpacing: "1.5px", fontWeight: "600",
            fontFamily: "Inter, sans-serif"
          }}>
            OUTPUT
          </div>
          <pre style={{
            flex: 1, color: "#d4d4d4", whiteSpace: "pre-wrap",
            fontFamily: "Consolas, monospace", fontSize: "14px",
            padding: "16px", margin: 0, overflowY: "auto"
          }}>
            {output || <span style={{ color: "#3a3a3a" }}>Run your code to see output here...</span>}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─── Root App Component ───────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoomId = urlParams.get("room");

    if (urlRoomId && !session) {
      // Prompt for username on every refresh or new tab!
      const userName = prompt("Enter your username to join room " + urlRoomId);
      if (userName) {
        setSession({ userName, roomId: urlRoomId });
      }
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
