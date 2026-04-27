import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function FileExplorer({ roomId, onFileSelect }) {
  const [tree, setTree] = useState({ folders: [], files: [] });
  const [expandedFolders, setExpandedFolders] = useState({});
  const [creatingNode, setCreatingNode] = useState(null); // { type: 'file' | 'folder', parentId: string | null }
  const [newNodeName, setNewNodeName] = useState("");
  const [activeFileId, setActiveFileId] = useState(null);

  const fetchTree = async () => {
    if (!roomId) return;
    try {
      const res = await axios.get(`http://localhost:5000/api/tree?roomId=${roomId}`);
      setTree(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTree();
  }, [roomId]);

  const handleCreateSubmit = async () => {
    if (!newNodeName.trim() || !roomId) {
      setCreatingNode(null);
      setNewNodeName("");
      return;
    }
    const { type, parentId } = creatingNode;
    try {
      if (type === 'folder') {
        await axios.post('http://localhost:5000/api/folders', { name: newNodeName, parentId, roomId });
      } else {
        await axios.post('http://localhost:5000/api/files', { name: newNodeName, folderId: parentId, content: '// ' + newNodeName + '\n', roomId });
      }
      setNewNodeName("");
      setCreatingNode(null);
      if (parentId) {
        setExpandedFolders(prev => ({ ...prev, [parentId]: true }));
      }
      fetchTree();
    } catch (err) {
      console.error("Failed to create", err);
    }
  };

  const handleRename = async (id, type) => {
    const newName = prompt(`Enter new name for this ${type}:`);
    if (!newName) return;
    await axios.put('http://localhost:5000/api/rename', { id, type, newName });
    fetchTree();
  };

  const handleDelete = async (id, type) => {
    if (!window.confirm(`Delete this ${type}?`)) return;
    await axios.delete('http://localhost:5000/api/delete', { data: { id, type } });
    if (activeFileId === id) setActiveFileId(null);
    fetchTree();
  };

  const toggleFolder = (id) => {
    setExpandedFolders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const startCreating = (e, type, parentId = null) => {
    e.stopPropagation();
    setCreatingNode({ type, parentId });
    setNewNodeName("");
    if (parentId) {
      setExpandedFolders(prev => ({ ...prev, [parentId]: true }));
    }
  };

  const selectFile = (id) => {
    setActiveFileId(id);
    onFileSelect(id);
  };

  const STYLES = {
    container: { width: '260px', background: '#181818', borderRight: '1px solid #2b2b2b', display: 'flex', flexDirection: 'column', height: '100%', fontFamily: "Inter, sans-serif" },
    header: { padding: '12px 14px', fontSize: '11px', color: '#ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '600', letterSpacing: '0.5px' },
    iconBtn: { background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '14px', padding: '2px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    treeWrapper: { flex: 1, overflowY: 'auto' }
  };

  const renderTree = (parentId, depth = 0) => {
    const folders = tree.folders.filter(f => f.parentId === parentId).sort((a,b) => a.name.localeCompare(b.name));
    const files = tree.files.filter(f => f.folderId === parentId).sort((a,b) => a.name.localeCompare(b.name));
    const indent = depth * 14 + 10;

    return (
      <div style={{ paddingLeft: '0px' }}>
        {folders.map(f => (
          <div key={f._id}>
            <div 
              className="tree-row"
              onClick={() => toggleFolder(f._id)}
              style={{ paddingLeft: `${indent}px`, paddingRight: '10px', display: 'flex', alignItems: 'center', color: '#e0e0e0', fontWeight: '500', cursor: 'pointer', height: '26px' }}
            >
              <span style={{ marginRight: '6px', fontSize: '12px', opacity: 0.8, transform: expandedFolders[f._id] ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.1s' }}>▶</span>
              <span style={{ marginRight: '6px', fontSize: '14px' }}>📂</span>
              <span style={{ flex: 1, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
              
              <div className="hover-actions" style={{ display: 'flex', gap: '2px' }}>
                <button style={STYLES.iconBtn} onClick={(e) => startCreating(e, 'file', f._id)} title="New File">📄</button>
                <button style={STYLES.iconBtn} onClick={(e) => startCreating(e, 'folder', f._id)} title="New Folder">📁</button>
                <button style={STYLES.iconBtn} onClick={(e) => { e.stopPropagation(); handleRename(f._id, 'folder'); }} title="Rename">✏️</button>
                <button style={STYLES.iconBtn} onClick={(e) => { e.stopPropagation(); handleDelete(f._id, 'folder'); }} title="Delete">🗑️</button>
              </div>
            </div>

            {expandedFolders[f._id] && renderTree(f._id, depth + 1)}
          </div>
        ))}

        {files.map(f => (
          <div 
            key={f._id} 
            className={`tree-row ${activeFileId === f._id ? 'active-row' : ''}`}
            onClick={() => selectFile(f._id)}
            style={{ paddingLeft: `${indent + 18}px`, paddingRight: '10px', display: 'flex', alignItems: 'center', color: activeFileId === f._id ? '#fff' : '#9cdcfe', cursor: 'pointer', height: '26px' }}
          >
            <span style={{ marginRight: '6px', fontSize: '14px' }}>📄</span>
            <span style={{ flex: 1, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
            <div className="hover-actions" style={{ display: 'flex', gap: '2px' }}>
              <button style={STYLES.iconBtn} onClick={(e) => { e.stopPropagation(); handleRename(f._id, 'file'); }} title="Rename">✏️</button>
              <button style={STYLES.iconBtn} onClick={(e) => { e.stopPropagation(); handleDelete(f._id, 'file'); }} title="Delete">🗑️</button>
            </div>
          </div>
        ))}

        {creatingNode?.parentId === parentId && (
          <div style={{ paddingLeft: `${indent + (creatingNode.type === 'file' ? 18 : 0)}px`, paddingRight: '10px', display: 'flex', alignItems: 'center', height: '26px' }}>
            <span style={{ marginRight: '6px', fontSize: '14px' }}>
              {creatingNode.type === 'folder' ? '📁' : '📄'}
            </span>
            <input 
              autoFocus
              value={newNodeName}
              onChange={e => setNewNodeName(e.target.value)}
              onBlur={() => { if(!newNodeName.trim()) setCreatingNode(null); }}
              onKeyDown={e => { 
                if (e.key === 'Enter') handleCreateSubmit(); 
                if (e.key === 'Escape') setCreatingNode(null); 
              }}
              style={{ flex: 1, background: '#3c3c3c', border: '1px solid #007fd4', color: 'white', padding: '2px 4px', fontSize: '13px', outline: 'none' }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={STYLES.container}>
      <style>{`
        .tree-row:hover { background: #2a2d2e; }
        .tree-row.active-row { background: #37373d; }
        .tree-row .hover-actions { opacity: 0; transition: opacity 0.1s; }
        .tree-row:hover .hover-actions { opacity: 1; }
        .tree-row .hover-actions button:hover { background: rgba(255,255,255,0.1); }
      `}</style>
      <div style={STYLES.header}>
        <span style={{ letterSpacing: '1px' }}>EXPLORER</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button style={STYLES.iconBtn} onClick={(e) => startCreating(e, 'file', null)} title="New File">📄</button>
          <button style={STYLES.iconBtn} onClick={(e) => startCreating(e, 'folder', null)} title="New Folder">📁</button>
        </div>
      </div>
      <div style={STYLES.treeWrapper}>
        {renderTree(null, 0)}
      </div>
    </div>
  );
}
