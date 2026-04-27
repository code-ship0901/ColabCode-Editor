# ⌨️ ColabCode Editor

A real-time, room-isolated collaborative code editor with a VS Code-style file system, multi-user cursor sync, and a collaborative whiteboard.

## 🚀 Features

- **Real-time Collaboration**: Multi-user code editing using Socket.io.
- **VS Code Style File System**: Create, rename, and delete files/folders in a hierarchical tree.
- **Persistent Tabs**: Open multiple files and switch between them; your tab state is preserved.
- **Multi-user Cursors**: See where others are typing with live name tags and selection highlights.
- **Collaborative Whiteboard**: Draw directly on top of the editor. Strokes are synced and saved per file.
- **C++ Code Execution**: Run C++ code directly from the browser (requires `g++` local setup).

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v16+)
- [npm](https://www.npmjs.com/)
- [Git](https://git-scm.com/)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account (or a local MongoDB instance).

## 📥 Installation & Setup

### 1. Clone the repository
```bash
git clone https://github.com/code-ship0901/ColabCode-Editor.git
cd ColabCode-Editor
```

### 2. Backend Setup
```bash
cd backend
npm install
```
- **Database Configuration**: Open `server.js` and update the `mongoose.connect` URL with your MongoDB connection string.
- **IP Whitelist**: Ensure your current IP address is whitelisted in your MongoDB Atlas Network Access settings.

### 3. Frontend Setup
```bash
cd ../app
npm install
```

## 🏃 Running the Project

### Start the Backend
```bash
cd backend
node server.js
```
*Note: The backend runs on `http://localhost:5000`.*

### Start the Frontend
```bash
cd app
npm run dev
```
*Note: The frontend runs on `http://localhost:5173`.*

## 🧪 Usage Instructions

1. Open `http://localhost:5173/` in your browser.
2. Enter your name and a Room ID (e.g., `test-room`) to join.
3. Open a **second browser tab** with the same Room ID and join as a different user.
4. Use the **📄+** and **📁+** icons in the sidebar to create your project structure.
5. Toggle **Scribble** mode to draw together on the editor!

---
Built with ❤️ by Antigravity
