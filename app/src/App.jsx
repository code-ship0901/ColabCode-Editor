import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { MonacoBinding } from "y-monaco";
import HomePage from "./HomePage";

function EditorPage({ userName, roomId }) {
  const [activeUsers, setActiveUsers] = useState([]);
  const [output, setOutput] = useState("");
  const [editorReady, setEditorReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const [userColor] = useState(() => {
    const colors = ["#ff3333", "#00d084", "#0693e3", "#9b51e0", "#fcb900"];
    return colors[Math.floor(Math.random() * colors.length)];
  });

  const docRef = useRef(new Y.Doc());
  const editorRef = useRef(null);
  const providerRef = useRef(null);
  const bindingRef = useRef(null);

  useEffect(() => {
    if (!roomId || !editorReady || !editorRef.current) return;

    providerRef.current?.destroy();
    bindingRef.current?.destroy();

    const roomName = `colab-editor-${roomId}`;
    providerRef.current = new WebrtcProvider(roomName, docRef.current, {
      signaling: ["wss://signaling.yjs.dev"],
    });

    const awareness = providerRef.current.awareness;

    awareness.setLocalStateField("user", {
      name: userName || "Anonymous",
      color: userColor,
    });

    const updateUsers = () => {
      const states = Array.from(awareness.getStates().entries());
      const users = states.map(([clientId, state]) => {
        if (state.user) return { clientId, ...state.user };
        return null;
      }).filter(Boolean);
      setActiveUsers(users);
    };

    awareness.on("change", updateUsers);

    const type = docRef.current.getText("monaco");
    bindingRef.current = new MonacoBinding(
      type,
      editorRef.current.getModel(),
      new Set([editorRef.current]),
      awareness
    );

    return () => {
      awareness.off("change", updateUsers);
      providerRef.current?.destroy();
      bindingRef.current?.destroy();
    };
  }, [roomId, editorReady, userName]);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
    setEditorReady(true);
  };

  const copyLink = () => {
    const url = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const runCode = async () => {
    if (!editorRef.current) return;
    setOutput("Running...");
    try {
      const res = await fetch("http://localhost:5000/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: editorRef.current.getValue() }),
      });
      const data = await res.json();
      setOutput(data.output);
    } catch (err) {
      console.error(err);
      setOutput(`Error: ${err.message || "Backend is offline. Check terminal."}`);
    }
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#1e1e1e", color: "white" }}>
      {/* Dynamic CSS for Monaco Cursors + Dropdown */}
      <style>{`
        ${activeUsers.map(u => `
          .yRemoteSelection-${u.clientId} { background-color: transparent !important; }
          .yRemoteSelectionHead-${u.clientId} {
            position: absolute;
            border-left: 2px solid ${u.color};
            box-sizing: border-box;
            display: inline-block;
            height: 100%;
          }
          .yRemoteSelectionHead-${u.clientId}::after {
            position: absolute;
            content: '${u.name}';
            border: 1px solid ${u.color};
            border-bottom: 0px;
            left: -2px; top: -16px;
            font-size: 11px;
            font-family: 'Inter', sans-serif;
            background-color: ${u.color};
            color: #fff; font-weight: 600;
            padding: 0px 4px;
            border-radius: 4px;
            border-bottom-left-radius: 0;
            white-space: nowrap;
            pointer-events: none;
            z-index: 10;
          }
        `).join("")}

        .users-container { position: relative; cursor: pointer; }
        .users-dropdown {
          position: absolute; top: 100%; right: 0; margin-top: 10px;
          background: #252526; border: 1px solid #444; border-radius: 8px;
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
        .user-row:hover { background: #333; }
      `}</style>

      {/* Navbar */}
      <div style={{
        padding: "10px 20px", background: "#161616", borderBottom: "1px solid #2a2a2a",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        boxShadow: "0 2px 10px rgba(0,0,0,0.4)", zIndex: 10
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {/* Logo */}
          <span style={{ fontWeight: "800", fontSize: "1.1rem", letterSpacing: "-0.5px",
            background: "linear-gradient(135deg, #fff, #a0c4ff)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            ⌨️ ColabCode
          </span>

          {/* Room badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#252526",
            padding: "5px 12px", borderRadius: "6px", border: "1px solid #333" }}>
            <span style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "1px" }}>Room</span>
            <span style={{ fontWeight: "700", color: "#e0e0e0", letterSpacing: "1px" }}>{roomId}</span>
          </div>

          {/* Active users chip */}
          <div className="users-container" style={{ display: "flex", alignItems: "center", gap: "8px",
            background: "#252526", padding: "4px 12px", borderRadius: "20px", border: "1px solid #333" }}>
            <div style={{ display: "flex" }}>
              {activeUsers.map((u, i) => (
                <div key={u.clientId} title={u.name} style={{
                  width: "28px", height: "28px", borderRadius: "50%", background: u.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: "700", border: "2px solid #161616", fontSize: "13px",
                  marginLeft: i > 0 ? "-8px" : "0", zIndex: activeUsers.length - i,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.3)"
                }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
            <span style={{ fontSize: "12px", color: "#666" }}>{activeUsers.length} online</span>

            {/* Dropdown */}
            <div className="users-dropdown">
              <div style={{ padding: "0 16px 8px", fontSize: "11px", color: "#666",
                borderBottom: "1px solid #333", marginBottom: "4px", letterSpacing: "0.5px" }}>
                CONNECTED ({activeUsers.length})
              </div>
              {activeUsers.map(u => (
                <div key={"dd-" + u.clientId} className="user-row">
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: u.color }} />
                  <span style={{ fontSize: "14px", color: "#e0e0e0" }}>{u.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right buttons */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={copyLink} style={{
            background: copied ? "#1a3a2a" : "#252526", color: copied ? "#00d084" : "#aaa",
            border: `1px solid ${copied ? "#00d08440" : "#333"}`, padding: "7px 14px",
            cursor: "pointer", borderRadius: "6px", fontWeight: "600", fontSize: "13px",
            display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s"
          }}>
            {copied ? "✓ Copied!" : "📋 Copy Link"}
          </button>
          <button onClick={runCode} style={{
            background: "linear-gradient(135deg, #4caf50, #388e3c)",
            color: "white", border: "none", padding: "7px 20px",
            cursor: "pointer", borderRadius: "6px", fontWeight: "700", fontSize: "13px",
            display: "flex", alignItems: "center", gap: "6px", transition: "opacity 0.2s",
            boxShadow: "0 2px 8px rgba(76,175,80,0.3)"
          }}
            onMouseOver={e => e.currentTarget.style.opacity = "0.85"}
            onMouseOut={e => e.currentTarget.style.opacity = "1"}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Run Code
          </button>
        </div>
      </div>

      {/* Editor + Output */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, borderRight: "1px solid #2a2a2a" }}>
          <Editor
            height="100%"
            theme="vs-dark"
            language="cpp"
            onMount={handleEditorDidMount}
            options={{ fontSize: 15, minimap: { enabled: false }, automaticLayout: true, fontFamily: "'Fira Code', Consolas, monospace", fontLigatures: true }}
          />
        </div>
        <div style={{ width: "360px", background: "#111", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #222", fontSize: "11px",
            color: "#555", letterSpacing: "1.5px", fontWeight: "600" }}>OUTPUT</div>
          <pre style={{ flex: 1, color: "#d4d4d4", whiteSpace: "pre-wrap", fontFamily: "Consolas, monospace",
            fontSize: "14px", padding: "16px", margin: 0, overflowY: "auto" }}>
            {output || <span style={{ color: "#444" }}>Run your code to see output here...</span>}
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ─── App: Router ───────────────────────────────── */
export default function App() {
  const [session, setSession] = useState(null); // { userName, roomId }

  // If URL already contains ?room=, prefill the home page
  // (HomePage handles this itself via URLSearchParams)

  if (!session) {
    return <HomePage onJoin={({ userName, roomId }) => {
      window.history.pushState({}, "", "?room=" + roomId);
      setSession({ userName, roomId });
    }} />;
  }

  return <EditorPage userName={session.userName} roomId={session.roomId} />;
}
