# ColabCode: Deep-Dive Explanation & Guide

This document provides a step-by-step breakdown of the project architecture, frontend logic, and backend execution engine.

---

## 1. Backend: `server.js` (The Execution Engine)

The backend is built with **Node.js** and **Express**. Its primary job is to take C++ code from the browser, compile it, and run it on your local machine.

### Step-by-Step Logic:
1.  **Dependencies**: Uses `express` for the API, `cors` for cross-origin access, and `child_process` (`exec`) to run system commands like `g++`.
2.  **Environment Check**: On startup, it ensures a `codes/` folder exists to store temporary files.
3.  **The `/run` Endpoint**:
    *   **Saving**: It receives the code and writes it to `codes/temp.cpp` using `fs.writeFileSync`.
    *   **Compiling & Running**: It executes a single terminal command: `g++ "temp.cpp" -o "temp.exe" && "temp.exe"`. 
        *   The `&&` ensures that the program only runs if the compilation succeeds.
    *   **Output Capture**: It captures the terminal's `stdout` (normal output) and `stderr` (errors) and sends them back to the React UI as a JSON response.

---

## 2. Frontend: `App.jsx` (The Collaboration Brain)

The frontend manages the user session, real-time synchronization, and communication with the backend.

### The Router Logic:
The `App` component acts as a switch. If the user hasn't joined a room (`session === null`), it shows the `HomePage`. Once they join, it swaps to the `EditorPage`.

### The Collaboration Engine (`useEffect`):
When the editor loads:
1.  **WebRTC Sync**: It connects to a "Room" using `y-webrtc`. This is **Peer-to-Peer**, meaning code changes go directly from your screen to your teammates' screens without being stored on a database.
2.  **User Awareness**: It broadcasts your name and a random assigned color to everyone else in the room. This is how the "Active Users" list and name tags work.
3.  **Monaco Binding**: It "glues" the Monaco Editor UI to the Yjs shared data. Every keystroke is converted into a "diff" and synced.

### Dynamic Cursors (CSS Injection):
Since Monaco doesn't have built-in support for remote cursors, we use a loop to generate CSS classes dynamically for every active user's `clientId`. This creates the colored bar and the floating name tag that follows their typing.

---

## 3. High-Level Concepts for Viva Prep

- **CRDT (Conflict-free Replicated Data Types)**: The mathematical algorithm behind Yjs. It ensures that even if two people type at the same time, the final code is merged correctly without conflicts.
- **OT (Operational Transformation)**: The older method used by Google Docs (requires a central server). Our CRDT method is decentralized and faster.
- **WebRTC Networking**: Data travels directly between users (P2P). We use a **Signaling Server** only for the initial "handshake" (finding IP addresses).
- **Backend Sandboxing**: In the current version, the backend runs code directly. In a production environment, this should happen inside a **Docker Container** for security.

---

## 4. How to Run (No New Dependencies Needed)
1. **Start Backend**: `cd backend` -> `node server.js`
2. **Start Frontend**: `cd app` -> `npm run dev`
