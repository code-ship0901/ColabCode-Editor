import { useState } from "react";

const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

export default function HomePage({ onJoin }) {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState(() => new URLSearchParams(window.location.search).get("room") || "");
  const [mode, setMode] = useState(null);
  const [error, setError] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCreate = () => {
    if (!name.trim()) { setError("Please enter your name first."); return; }
    const code = generateRoomCode();
    setCreatedCode(code);
    setRoomCode(code);
    setError("");
    setMode("create");
    window.history.pushState({}, "", "?room=" + code);
  };

  const handleJoin = () => {
    if (!name.trim()) { setError("Please enter your name first."); return; }
    if (!roomCode.trim()) { setError("Please enter a room code or paste a link."); return; }
    let finalCode = roomCode.trim();
    try { const url = new URL(finalCode); finalCode = url.searchParams.get("room") || finalCode; } catch (_) {}
    setError("");
    onJoin({ userName: name.trim(), roomId: finalCode });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/?room=${createdCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "#1e1e1e", fontFamily: "'Inter', sans-serif", color: "white",
    }}>
      <style>{`
        .hp-input {
          width: 100%; box-sizing: border-box;
          padding: 10px 14px; border-radius: 6px;
          border: 1px solid #3a3a3a; background: #2a2a2a;
          color: #e0e0e0; font-size: 14px; font-family: 'Inter', sans-serif;
          outline: none; transition: border-color 0.15s;
        }
        .hp-input:focus { border-color: #555; }
        .hp-input::placeholder { color: #4a4a4a; }
        .hp-btn {
          width: 100%; padding: 10px; border-radius: 6px; border: none;
          font-size: 14px; font-weight: 600; font-family: 'Inter', sans-serif;
          cursor: pointer; background: #0693e3; color: white;
          transition: background 0.15s; letter-spacing: 0.2px;
        }
        .hp-btn:hover { background: #057ab8; }
        .room-card {
          background: #252526; border: 1px solid #333; border-radius: 8px;
          padding: 18px; cursor: pointer; transition: border-color 0.15s;
        }
        .room-card:hover { border-color: #555; }
        .back-link {
          text-align: center; margin-top: 12px; font-size: 12px;
          color: #555; cursor: pointer; transition: color 0.15s;
        }
        .back-link:hover { color: #888; }
      `}</style>

      {/* Navbar */}
      <div style={{
        padding: "12px 24px", background: "#161616", borderBottom: "1px solid #2a2a2a",
        display: "flex", alignItems: "center"
      }}>
        <span style={{
          fontWeight: "800", fontSize: "1rem", letterSpacing: "-0.3px",
          background: "linear-gradient(135deg, #fff, #a0c4ff)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
        }}>
          ⌨️ ColabCode
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <div style={{ width: "100%", maxWidth: "400px" }}>

          {/* Hero */}
          <div style={{ marginBottom: "32px" }}>
            <h1 style={{ margin: "0 0 8px", fontSize: "1.75rem", fontWeight: "700", letterSpacing: "-0.5px", color: "#f0f0f0" }}>
              Collaborate in Code
            </h1>
            <p style={{ margin: 0, color: "#666", fontSize: "14px", lineHeight: "1.6" }}>
              Real-time C++ editor — create or join a room to get started.
            </p>
          </div>

          {/* Card */}
          <div style={{ background: "#252526", border: "1px solid #333", borderRadius: "10px", padding: "28px" }}>

            {/* Name */}
            <label style={{ display: "block", marginBottom: "6px", fontSize: "11px", color: "#666", letterSpacing: "0.8px", textTransform: "uppercase" }}>Your Name</label>
            <input
              className="hp-input"
              placeholder="e.g. Vanshika"
              value={name}
              onChange={e => { setName(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && mode === "join" && handleJoin()}
              style={{ marginBottom: error && !mode ? "6px" : "20px" }}
            />
            {error && !mode && <div style={{ color: "#c0392b", fontSize: "12px", marginBottom: "14px" }}>⚠ {error}</div>}

            {/* Mode select */}
            {!mode && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div className="room-card" onClick={handleCreate}>
                  <div style={{ fontSize: "1.3rem", marginBottom: "8px" }}>🚀</div>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: "#e0e0e0", marginBottom: "3px" }}>Create Room</div>
                  <div style={{ color: "#555", fontSize: "12px", lineHeight: "1.4" }}>Start a new session and invite others</div>
                </div>
                <div className="room-card" onClick={() => { if (!name.trim()) { setError("Enter your name first."); return; } setMode("join"); }}>
                  <div style={{ fontSize: "1.3rem", marginBottom: "8px" }}>🔗</div>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: "#e0e0e0", marginBottom: "3px" }}>Join Room</div>
                  <div style={{ color: "#555", fontSize: "12px", lineHeight: "1.4" }}>Enter a code or paste an invite link</div>
                </div>
              </div>
            )}

            {/* Create result */}
            {mode === "create" && createdCode && (
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "11px", color: "#666", letterSpacing: "0.8px", textTransform: "uppercase" }}>Room Code</label>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#1e1e1e", border: "1px solid #3a3a3a", borderRadius: "6px",
                  padding: "10px 14px", marginBottom: "16px"
                }}>
                  <span style={{ fontSize: "18px", fontWeight: "800", letterSpacing: "4px", color: "#7ec8f7", fontFamily: "Consolas, monospace" }}>{createdCode}</span>
                  <button onClick={copyLink} style={{
                    background: "transparent", color: copied ? "#00d084" : "#666",
                    border: "1px solid #3a3a3a", borderRadius: "5px",
                    padding: "4px 10px", cursor: "pointer", fontSize: "12px",
                    fontFamily: "Inter, sans-serif", fontWeight: "600", transition: "color 0.15s"
                  }}>
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
                <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#555", lineHeight: "1.5" }}>
                  Share this code with your teammates. Enter the room when ready.
                </p>
                <button className="hp-btn" onClick={handleJoin}>Enter Room →</button>
                <div className="back-link" onClick={() => { setMode(null); setCreatedCode(""); setRoomCode(""); }}>← Back</div>
              </div>
            )}

            {/* Join form */}
            {mode === "join" && (
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "11px", color: "#666", letterSpacing: "0.8px", textTransform: "uppercase" }}>Room Code or Link</label>
                <input
                  className="hp-input"
                  placeholder="ABC123  or  http://localhost:5173/?room=..."
                  value={roomCode}
                  onChange={e => { setRoomCode(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleJoin()}
                  style={{ marginBottom: "8px" }}
                  autoFocus
                />
                {error && <div style={{ color: "#c0392b", fontSize: "12px", marginBottom: "10px" }}>⚠ {error}</div>}
                <button className="hp-btn" onClick={handleJoin} style={{ marginTop: "8px" }}>Join Room →</button>
                <div className="back-link" onClick={() => { setMode(null); setError(""); }}>← Back</div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ textAlign: "center", marginTop: "20px", color: "#3a3a3a", fontSize: "11px" }}>
            Powered by Yjs · Monaco Editor · WebRTC
          </div>
        </div>
      </div>
    </div>
  );
}
