import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { MonacoBinding } from "y-monaco";

function App() {
  const [activeRoom, setActiveRoom] = useState(null);
  const [roomId, setRoomId] = useState("");
  const [output, setOutput] = useState("");
  const [editorReady, setEditorReady] = useState(false); // New state to trigger sync
  
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
    
    // 2. Bind Monaco to Yjs Shared Text
    const type = docRef.current.getText("monaco");
    bindingRef.current = new MonacoBinding(
      type,
      editorRef.current.getModel(),
      new Set([editorRef.current]),
      providerRef.current.awareness
    );

    return () => {
      providerRef.current?.destroy();
      bindingRef.current?.destroy();
    };
  }, [activeRoom, editorReady]); // Runs when room is joined or editor loads

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
      {/* Navbar */}
      <div style={{ padding: "10px", background: "#252526", display: "flex", justifyContent: "space-between", borderBottom: "1px solid #333" }}>
        {!activeRoom ? (
          <div>
            <input 
              value={roomId} 
              onChange={(e) => setRoomId(e.target.value)} 
              placeholder="Enter Room ID" 
              style={{ padding: "6px", borderRadius: "4px", border: "1px solid #444", background: "#333", color: "white" }} 
            />
            <button onClick={() => setActiveRoom(roomId)} style={{ marginLeft: "10px", padding: "6px 12px", cursor: "pointer", background: "#007acc", color: "white", border: "none", borderRadius: "4px" }}>Join Room</button>
          </div>
        ) : (
          <>
            <span>Room: <b>{activeRoom}</b></span>
            <button onClick={runCode} style={{ background: "#4caf50", color: "white", border: "none", padding: "6px 20px", cursor: "pointer", borderRadius: "4px", fontWeight: "bold" }}>▶ Run Code</button>
          </>
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

