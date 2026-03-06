import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { MonacoBinding } from "y-monaco";

function App() {
  const [activeRoom, setActiveRoom] = useState(null);
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [activeUsers, setActiveUsers] = useState([]);
  const [output, setOutput] = useState("");
  const [editorReady, setEditorReady] = useState(false); // New state to trigger sync

  // Generate a random stable color for the user's cursor once
  const [userColor] = useState(() => {
    // Distinct, accessible colors
    const colors = ["#ff3333", "#00d084", "#0693e3", "#9b51e0", "#fcb900"];
    return colors[Math.floor(Math.random() * colors.length)];
  });

  
  const docRef = useRef(new Y.Doc());
  const editorRef = useRef(null);
  const providerRef = useRef(null);
  const bindingRef = useRef(null);

  // Sync Logic: Connects users and binds the editor
  useEffect(() => {
    // Only bind if both the room is joined AND the editor has loaded
    if (!activeRoom || !editorReady || !editorRef.current) return;

    // Cleanup existing connections if any
    providerRef.current?.destroy();
    bindingRef.current?.destroy();

    // 1. Initialize WebRTC Provider
    const roomName = `colab-editor-${activeRoom}`; // Re-added the prefix to prevent public room collisions
    providerRef.current = new WebrtcProvider(roomName, docRef.current, {
      signaling: ["wss://signaling.yjs.dev"], // Re-added signaling servers for stability
    });
    
    const awareness = providerRef.current.awareness;

    // Set local awareness state
    awareness.setLocalStateField("user", {
      name: userName || "Anonymous",
      color: userColor,
    });

    // Listen to changes to populate active users for the navbar
    const updateUsers = () => {
      const states = Array.from(awareness.getStates().entries());
      const users = states.map(([clientId, state]) => {
        if (state.user) {
          return { clientId, ...state.user };
        }
        return null;
      }).filter(Boolean);
      setActiveUsers(users);
    };

    awareness.on("change", updateUsers);
    
    // 2. Bind Monaco to Yjs Shared Text
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
  }, [activeRoom, editorReady, userName]); // Runs when room is joined or editor loads

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
    setEditorReady(true);
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
      setOutput(`Error: ${err.message || 'Backend is offline. Check terminal.'}`);
    }
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#1e1e1e", color: "white" }}>
      {/* Dynamic CSS for Monaco Cursors */}
      <style>
        {activeUsers.map(u => `
          .yRemoteSelection-${u.clientId} {
            background-color: transparent !important; /* Disabled selection highlighting as requested */
          }
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
            left: -2px;
            top: -16px;
            font-size: 11px;
            font-family: 'Inter', sans-serif;
            background-color: ${u.color};
            color: #fff;
            font-weight: 600;
            padding: 0px 4px;
            border-radius: 4px;
            border-bottom-left-radius: 0;
            white-space: nowrap;
            pointer-events: none;
            z-index: 10;
          }
        `).join('\n')}
      </style>

      {/* Navbar */}
      <div style={{ padding: "10px 20px", background: "#1e1e1e", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.2)", zIndex: 10 }}>
        {!activeRoom ? (
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <h2 style={{ margin: "0 20px 0 0", fontSize: "1.2rem", fontWeight: "600", color: "#e0e0e0" }}>ColabCode</h2>
            <input 
              value={userName} 
              onChange={(e) => setUserName(e.target.value)} 
              placeholder="Your Name" 
              style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #444", background: "#252526", color: "white", outline: "none", fontSize: "14px", transition: "border 0.2s" }} 
              onFocus={(e) => e.target.style.borderColor = "#007acc"}
              onBlur={(e) => e.target.style.borderColor = "#444"}
            />
            <input 
              value={roomId} 
              onChange={(e) => setRoomId(e.target.value)} 
              placeholder="Enter Room ID" 
              style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #444", background: "#252526", color: "white", outline: "none", fontSize: "14px", transition: "border 0.2s" }} 
              onFocus={(e) => e.target.style.borderColor = "#007acc"}
              onBlur={(e) => e.target.style.borderColor = "#444"}
            />
            <button 
              onClick={() => { 
                if(roomId && userName) setActiveRoom(roomId); 
                else alert("Please enter both your Name and a Room ID to join."); 
              }} 
              style={{ padding: "8px 16px", cursor: "pointer", background: "#007acc", color: "white", border: "none", borderRadius: "6px", fontWeight: "500", transition: "background 0.2s" }}
              onMouseOver={(e) => e.target.style.background = "#005f9e"}
              onMouseOut={(e) => e.target.style.background = "#007acc"}
            >
              Join Room
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", width: "100%", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#252526", padding: "6px 12px", borderRadius: "6px", border: "1px solid #333" }}>
                <span style={{ fontSize: "12px", color: "#888", textTransform: "uppercase", letterSpacing: "1px" }}>Room</span>
                <span style={{ fontWeight: "600", color: "#e0e0e0" }}>{activeRoom}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#252526", padding: "4px 12px", borderRadius: "20px", border: "1px solid #333" }}>
                <span style={{ fontSize: "12px", color: "#888", marginRight: "4px" }}>Active Users:</span>
                <div style={{ display: "flex" }}>
                  {activeUsers.map((u, i) => (
                    <div 
                      key={u.clientId} 
                      title={u.name} 
                      style={{ 
                        width: "30px", height: "30px", borderRadius: "50%", background: u.color, 
                        display: "flex", alignItems: "center", justifyContent: "center", 
                        fontWeight: "bold", border: "2px solid #1e1e1e", fontSize: "14px",
                        marginLeft: i > 0 ? "-10px" : "0", zIndex: activeUsers.length - i,
                        boxShadow: "0 2px 4px rgba(0,0,0,0.2)", cursor: "default"
                      }}
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button 
              onClick={runCode} 
              style={{ 
                background: "#4caf50", color: "white", border: "none", padding: "8px 24px", 
                cursor: "pointer", borderRadius: "6px", fontWeight: "600", fontSize: "14px",
                display: "flex", alignItems: "center", gap: "8px", transition: "background 0.2s"
              }}
              onMouseOver={(e) => e.target.style.background = "#388e3c"}
              onMouseOut={(e) => e.target.style.background = "#4caf50"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Run Code
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, borderRight: "1px solid #333" }}>
          {activeRoom && (
             <Editor
              height="100%"
              theme="vs-dark"
              language="cpp"
              onMount={handleEditorDidMount}
              options={{ fontSize: 16, minimap: { enabled: false }, automaticLayout: true }}
            />
          )}
        </div>
        <div style={{ width: "350px", background: "#111", padding: "15px", overflowY: "auto" }}>
          <div style={{ color: "#888", fontSize: "12px", marginBottom: "10px", letterSpacing: "1px" }}>OUTPUT</div>
          <pre style={{ color: "#d4d4d4", whiteSpace: "pre-wrap", fontFamily: "Consolas, monospace", fontSize: "14px" }}>{output || "No output yet..."}</pre>
        </div>
      </div>
    </div>
  );
}

export default App;

