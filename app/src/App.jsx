import React, { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { MonacoBinding } from "y-monaco";

// Move this outside to keep a single source of truth
const ydoc = new Y.Doc();

function App() {
  const [activeRoom, setActiveRoom] = useState(null);
  const [roomId, setRoomId] = useState("");
  const [output, setOutput] = useState("");
  
  const editorRef = useRef(null);
  const providerRef = useRef(null);
  const bindingRef = useRef(null);

  // This handles the real-time sync logic
  useEffect(() => {
    if (!activeRoom || !editorRef.current) return;

    // 1. Clean up old connections
    if (providerRef.current) providerRef.current.destroy();
    if (bindingRef.current) bindingRef.current.destroy();

    // 2. Initialize Provider
    // Use a unique room name to avoid collisions with other users on the public server
    const roomName = `colab-editor-${activeRoom}`;
    providerRef.current = new WebrtcProvider(roomName, ydoc, {
      signaling: ["wss://signaling.yjs.dev"],
    });

    // 3. Bind Monaco to the shared Y.Text
    const ytext = ydoc.getText("monaco");
    bindingRef.current = new MonacoBinding(
      ytext,
      editorRef.current.getModel(),
      new Set([editorRef.current]),
      providerRef.current.awareness
    );

    return () => {
      providerRef.current?.destroy();
      bindingRef.current?.destroy();
    };
  }, [activeRoom, editorRef.current]);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
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
      setOutput("Error: Backend offline.");
    }
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#1e1e1e", color: "white" }}>
      <div style={{ padding: "10px", background: "#252526", display: "flex", justifyContent: "space-between", borderBottom: "1px solid #333" }}>
        {!activeRoom ? (
          <div>
            <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Enter Room ID" style={{ padding: "6px", background: "#333", color: "white", border: "1px solid #555" }} />
            <button onClick={() => setActiveRoom(roomId)} style={{ marginLeft: "10px", padding: "6px 12px", background: "#007acc", color: "white", border: "none", cursor: "pointer" }}>Join Room</button>
          </div>
        ) : (
          <>
            <span>Room ID: <b>{activeRoom}</b></span>
            <button onClick={runCode} style={{ background: "#4caf50", color: "white", border: "none", padding: "6px 20px", cursor: "pointer", borderRadius: "4px" }}>▶ Run Code</button>
          </>
        )}
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        <div style={{ flex: 1, borderRight: "1px solid #333" }}>
          {activeRoom && (
            <Editor
              height="100%"
              theme="vs-dark"
              language="cpp"
              onMount={handleEditorDidMount}
              options={{ fontSize: 16, minimap: { enabled: false } }}
            />
          )}
        </div>
        <div style={{ width: "350px", background: "#111", padding: "15px" }}>
          <div style={{ color: "#888", fontSize: "12px", marginBottom: "10px" }}>CONSOLE OUTPUT</div>
          <pre style={{ color: "#d4d4d4", whiteSpace: "pre-wrap" }}>{output || "Output will appear here..."}</pre>
        </div>
      </div>
    </div>
  );
}

export default App;
