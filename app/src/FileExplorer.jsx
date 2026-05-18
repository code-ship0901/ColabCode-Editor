import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = "http://localhost:5000";

export default function FileExplorer({ roomId, onFileSelect, refreshTick, onTreeUpdate }) {
  const [tree, setTree] = useState({ folders: [], files: [] });
  const [expandedFolders, setExpandedFolders] = useState({});
  const [creatingNode, setCreatingNode] = useState(null);
  const [newNodeName, setNewNodeName] = useState("");
  const [activeFileId, setActiveFileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTree = async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/tree?roomId=${roomId}`);
      setTree(res.data);
      setError(null);
    } catch (err) {
      console.error("fetchTree error:", err);
      setError(err.message === "Network Error" ? "Backend Offline" : "DB Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTree(); }, [roomId, refreshTick]);

  useEffect(() => {
    if (onTreeUpdate && tree) {
      onTreeUpdate(tree);
    }
  }, [tree, onTreeUpdate]);

  useEffect(() => {
    console.log("Current creatingNode state:", creatingNode);
  }, [creatingNode]);

  const handleCreateSubmit = async () => {
    if (!newNodeName.trim() || !roomId) {
      setCreatingNode(null);
      setNewNodeName("");
      return;
    }
    const { type, parentId } = creatingNode;
    const name = newNodeName;
    
    // Optimistic Update: add a temporary node to the tree
    const tempId = "temp-" + Date.now();
    const optimisticNode = { _id: tempId, name, [type === 'folder' ? 'parentId' : 'folderId']: parentId, isOptimistic: true };
    setTree(prev => ({
      ...prev,
      [type === 'folder' ? 'folders' : 'files']: [...prev[type === 'folder' ? 'folders' : 'files'], optimisticNode]
    }));

    setNewNodeName("");
    setCreatingNode(null);

    try {
      if (type === 'folder') {
        await axios.post(`${BACKEND_URL}/api/folders`, { name, parentId, roomId });
      } else {
        let defaultContent = '// ' + name + '\n';
        const ext = name.split('.').pop().toLowerCase();
        if (ext === 'py') {
          defaultContent = '# ' + name + '\n';
        } else if (ext === 'html') {
          defaultContent = `<!-- ${name} -->\n`;
        }
        const res = await axios.post(`${BACKEND_URL}/api/files`, {
          name,
          folderId: parentId,
          content: defaultContent,
          roomId
        });
        // Select real file once server returns it
        selectFile(res.data._id);
      }
      if (parentId) setExpandedFolders(prev => ({ ...prev, [String(parentId)]: true }));
      fetchTree(); // Refresh to replace temp node with real one
    } catch (err) {
      console.error("Failed to create node:", err);
      setError("Failed to save. Check connection.");
      fetchTree(); // Rollback optimistic update
    }
  };

  const handleRename = async (id, type) => {
    const newName = prompt(`Enter new name for this ${type}:`);
    if (!newName) return;
    await axios.put(`${BACKEND_URL}/api/rename`, { id, type, newName });
    fetchTree();
  };

  const handleDelete = async (id, type) => {
    if (!window.confirm(`Delete this ${type}?`)) return;
    await axios.delete(`${BACKEND_URL}/api/delete`, { data: { id, type } });
    if (activeFileId === id) setActiveFileId(null);
    fetchTree();
  };

  const toggleFolder = (id) => {
    setExpandedFolders(prev => ({ ...prev, [String(id)]: !prev[String(id)] }));
  };

  const startCreating = (e, type, parentId = null) => {
    console.log("startCreating clicked:", { type, parentId });
    if (parentId) e.stopPropagation(); // Only stop for nested items to prevent folder toggle
    setCreatingNode({ type, parentId });
    setNewNodeName("");
    if (parentId) setExpandedFolders(prev => ({ ...prev, [String(parentId)]: true }));
  };

  const selectFile = (id) => {
    setActiveFileId(id);
    onFileSelect(id);
  };

  // ── Tree renderer ────────────────────────────────────────────
  const renderTree = (parentId, depth = 0) => {
    // Normalize both sides to string for safe ObjectId comparison
    const pid = parentId ? String(parentId) : null;

    const folders = tree.folders
      .filter(f => (f.parentId ? String(f.parentId) : null) === pid)
      .sort((a, b) => a.name.localeCompare(b.name));

    const files = tree.files
      .filter(f => (f.folderId ? String(f.folderId) : null) === pid)
      .sort((a, b) => a.name.localeCompare(b.name));

    const indent = depth * 14 + 10;

    return (
      <div>
        {folders.map(f => (
          <div key={f._id}>
            <div
              className={`tree-row ${f.isOptimistic ? 'optimistic-node' : ''}`}
              onClick={() => !f.isOptimistic && toggleFolder(f._id)}
              style={{
                paddingLeft: `${indent}px`, paddingRight: '10px',
                display: 'flex', alignItems: 'center',
                color: f.isOptimistic ? '#666' : '#e0e0e0', fontWeight: '500', 
                cursor: f.isOptimistic ? 'wait' : 'pointer', height: '26px'
              }}
            >
              <span style={{
                marginRight: '6px', fontSize: '11px', opacity: f.isOptimistic ? 0.2 : 0.7,
                transform: expandedFolders[String(f._id)] ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.1s', display: 'inline-block'
              }}>▶</span>
              <span style={{ marginRight: '6px', fontSize: '14px', opacity: f.isOptimistic ? 0.4 : 1 }}>📂</span>
              <span style={{ flex: 1, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {f.name} {f.isOptimistic && "..."}
              </span>
              {!f.isOptimistic && (
                <div className="hover-actions" style={{ display: 'flex', gap: '2px' }}>
                  <button style={ICON_BTN} onClick={e => startCreating(e, 'file', f._id)} title="New File">📄</button>
                  <button style={ICON_BTN} onClick={e => startCreating(e, 'folder', f._id)} title="New Folder">📁</button>
                  <button style={ICON_BTN} onClick={e => { e.stopPropagation(); handleRename(f._id, 'folder'); }} title="Rename">✏️</button>
                  <button style={ICON_BTN} onClick={e => { e.stopPropagation(); handleDelete(f._id, 'folder'); }} title="Delete">🗑️</button>
                </div>
              )}
            </div>
            {expandedFolders[String(f._id)] && renderTree(f._id, depth + 1)}
          </div>
        ))}

        {files.map(f => (
          <div
            key={f._id}
            className={`tree-row ${activeFileId === f._id ? 'active-row' : ''}`}
            onClick={() => !f.isOptimistic && selectFile(f._id)}
            style={{
              paddingLeft: `${indent + 20}px`, paddingRight: '10px',
              display: 'flex', alignItems: 'center',
              color: f.isOptimistic ? '#666' : (activeFileId === f._id ? '#fff' : '#9cdcfe'),
              cursor: f.isOptimistic ? 'wait' : 'pointer', height: '26px',
              fontStyle: f.isOptimistic ? 'italic' : 'normal'
            }}
          >
            <span style={{ marginRight: '6px', fontSize: '14px', opacity: f.isOptimistic ? 0.4 : 1 }}>📄</span>
            <span style={{ flex: 1, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {f.name} {f.isOptimistic && "..."}
            </span>
            {!f.isOptimistic && (
              <div className="hover-actions" style={{ display: 'flex', gap: '2px' }}>
                <button style={ICON_BTN} onClick={e => { e.stopPropagation(); handleRename(f._id, 'file'); }} title="Rename">✏️</button>
                <button style={ICON_BTN} onClick={e => { e.stopPropagation(); handleDelete(f._id, 'file'); }} title="Delete">🗑️</button>
              </div>
            )}
          </div>
        ))}

        {/* Inline input for naming new node */}
        {creatingNode?.parentId === parentId && (
          <div style={{
            paddingLeft: `${indent + (creatingNode.type === 'file' ? 20 : 0)}px`,
            paddingRight: '10px', display: 'flex', alignItems: 'center', height: '26px'
          }}>
            <span style={{ marginRight: '6px', fontSize: '14px' }}>
              {creatingNode.type === 'folder' ? '📁' : '📄'}
            </span>
            <input
              autoFocus
              value={newNodeName}
              onChange={e => setNewNodeName(e.target.value)}
              onBlur={() => { if (!newNodeName.trim()) setCreatingNode(null); else handleCreateSubmit(); }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateSubmit();
                if (e.key === 'Escape') setCreatingNode(null);
              }}
              style={{
                flex: 1, background: '#3c3c3c', border: '1px solid #007fd4',
                color: 'white', padding: '2px 4px', fontSize: '13px', outline: 'none'
              }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ width: '260px', background: '#181818', borderRight: '1px solid #2b2b2b', display: 'flex', flexDirection: 'column', height: '100%', fontFamily: "Inter, sans-serif" }}>
      <style>{`
        .tree-row:hover { background: #2a2d2e; }
        .tree-row.active-row { background: #37373d; }
        .tree-row .hover-actions { opacity: 0; transition: opacity 0.1s; }
        .tree-row:hover .hover-actions { opacity: 1; }
        .tree-row .hover-actions button:hover { background: rgba(255,255,255,0.1); }
      `}</style>

      {/* Header */}
      <div style={{ padding: '12px 14px', fontSize: '11px', color: '#ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '600', letterSpacing: '0.5px' }}>
        <span style={{ letterSpacing: '1px' }}>EXPLORER</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button style={ICON_BTN} onClick={e => startCreating(e, 'file', null)} title="New File at root">📄</button>
          <button style={ICON_BTN} onClick={e => startCreating(e, 'folder', null)} title="New Folder at root">📁</button>
        </div>
      </div>

      {/* Tree & Inputs */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        
        {/* Creation Input (Root Level) */}
        {creatingNode && (creatingNode.parentId === null || creatingNode.parentId === undefined) && (
          <div style={{ 
            padding: '10px 12px', background: '#2d2d2d', border: '2px solid #007fd4',
            display: 'flex', alignItems: 'center', marginBottom: '8px', borderRadius: '4px',
            margin: '4px 8px', boxShadow: '0 0 10px rgba(0,127,212,0.3)'
          }}>
            <span style={{ marginRight: '8px', fontSize: '16px' }}>
              {creatingNode.type === 'folder' ? '📁' : '📄'}
            </span>
            <input
              autoFocus
              placeholder={`Enter ${creatingNode.type} name...`}
              value={newNodeName}
              onChange={e => setNewNodeName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateSubmit();
                if (e.key === 'Escape') setCreatingNode(null);
              }}
              style={{ 
                flex: 1, background: '#3c3c3c', border: 'none', 
                color: 'white', padding: '6px 10px', fontSize: '14px', outline: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: '4px', marginLeft: '6px' }}>
              <button onClick={handleCreateSubmit} style={{ ...ICON_BTN, color: '#00d084' }} title="Save">OK</button>
              <button onClick={() => setCreatingNode(null)} style={{ ...ICON_BTN, color: '#e74c3c' }} title="Cancel">✕</button>
            </div>
          </div>
        )}

        {loading && <div style={{ padding: '20px', fontSize: '12px', color: '#888', textAlign: 'center' }}>Loading...</div>}
        {error && <div style={{ padding: '20px', fontSize: '12px', color: '#e74c3c', textAlign: 'center', background: '#331111' }}>⚠️ {error}</div>}
        
        {!loading && !error && tree.folders.length === 0 && tree.files.length === 0 && (
          <div style={{ padding: '20px', fontSize: '11px', color: '#666', textAlign: 'center', lineHeight: '1.6' }}>
            No files yet in this room.<br/>
            Click 📄+ or 📁+ icons above to start.
          </div>
        )}

        {renderTree(null, 0)}
      </div>
    </div>
  );
}

const ICON_BTN = {
  background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer',
  fontSize: '16px', padding: '4px 6px', borderRadius: '4px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.2s'
};
