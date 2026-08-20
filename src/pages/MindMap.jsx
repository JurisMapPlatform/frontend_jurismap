import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  getNodesBounds, getViewportForBounds, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { ArrowLeft, Pencil, Image, FileText, Sparkles, Download, RefreshCw } from 'lucide-react';
import { analysisApi, mindmapApi } from '../services/api';
import NodeModal from '../components/NodeModal';
import NodeContextMenu from '../components/NodeContextMenu';
import styles from './MindMap.module.css';

const defaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { stroke: '#94a3b8', strokeWidth: 1.5 },
};

// 2048x1536 (~3.1 MP): nítido para A4 y dentro del límite de rasterización SVG→imagen del
// navegador. Valores mayores (p. ej. 4096x3072) hacen que html-to-image nunca dispare onload
// y la exportación quede colgada.
const IMAGE_WIDTH = 2048;
const IMAGE_HEIGHT = 1536;
const CANVAS_TIMEOUT_MS = 20000;

const NODE_STYLES = {
  central: {
    background: '#1e293b', color: '#fff', fontWeight: 700,
    padding: '14px 24px', borderRadius: '10px', fontSize: '14px',
    border: 'none', minWidth: '200px', textAlign: 'center',
  },
  category: {
    background: '#fff', border: '2px solid #334155', fontWeight: 600,
    padding: '10px 18px', borderRadius: '8px', fontSize: '13px',
    minWidth: '140px', textAlign: 'center',
  },
  fundamento: {
    background: '#fef3c7', border: '1px solid #f59e0b',
    padding: '8px 14px', borderRadius: '6px', fontSize: '12px',
    maxWidth: '200px',
  },
  detail: {
    background: '#f0f9ff', border: '1px solid #93c5fd',
    padding: '8px 14px', borderRadius: '6px', fontSize: '12px',
    maxWidth: '200px',
  },
  ai_generated: {
    background: '#ede9fe', border: '1px solid #8b5cf6',
    padding: '8px 14px', borderRadius: '6px', fontSize: '12px',
    maxWidth: '220px',
  },
};

const CATEGORY_ORDER = ['materia', 'partes', 'pretension', 'antecedentes', 'fundamentos', 'fallo', 'votos'];

function layoutTree(rawNodes, rawEdges) {
  const childrenMap = {};
  const parentMap = {};
  for (const e of rawEdges) {
    if (!childrenMap[e.source]) childrenMap[e.source] = [];
    childrenMap[e.source].push(e.target);
    parentMap[e.target] = e.source;
  }

  const roots = rawNodes.filter((n) => !parentMap[n.id]);
  const nodeMap = {};
  rawNodes.forEach((n) => { nodeMap[n.id] = n; });

  const COL_WIDTH = 300;
  const ROW_GAP_CATEGORY = 100;
  const ROW_GAP_LEAF = 70;

  function getSubtreeHeight(nodeId) {
    const children = childrenMap[nodeId] || [];
    if (children.length === 0) return ROW_GAP_LEAF;
    const node = nodeMap[nodeId];
    const gap = node?.type === 'central' ? ROW_GAP_CATEGORY : ROW_GAP_LEAF;
    return children.reduce((sum, cid) => sum + getSubtreeHeight(cid), 0) + (children.length - 1) * (gap - ROW_GAP_LEAF);
  }

  const visited = new Set();
  function place(nodeId, x, yStart, yEnd) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodeMap[nodeId];
    if (!node) return;

    const yCenter = (yStart + yEnd) / 2;
    node.position = { x, y: yCenter };

    const children = childrenMap[nodeId] || [];
    if (children.length === 0) return;

    if (node.type === 'central') {
      children.sort((a, b) => {
        const ai = CATEGORY_ORDER.findIndex((c) => a.startsWith(c));
        const bi = CATEGORY_ORDER.findIndex((c) => b.startsWith(c));
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
    }

    const totalH = children.reduce((sum, cid) => sum + getSubtreeHeight(cid), 0);
    const gap = node.type === 'central' ? ROW_GAP_CATEGORY : ROW_GAP_LEAF;
    const totalWithGaps = totalH + (children.length - 1) * (gap - ROW_GAP_LEAF);
    let curY = yCenter - totalWithGaps / 2;

    for (const cid of children) {
      const h = getSubtreeHeight(cid);
      place(cid, x + COL_WIDTH, curY, curY + h);
      curY += h + (gap - ROW_GAP_LEAF);
    }
  }

  for (const root of roots) {
    const totalH = getSubtreeHeight(root.id);
    place(root.id, 0, -totalH / 2, totalH / 2);
  }

  return rawNodes;
}

function transformNodes(rawNodes, rawEdges) {
  const hasPositions = rawNodes.some(
    (n) => n.position && typeof n.position.x === 'number' && (n.position.x !== 0 || n.position.y !== 0)
  );

  const prepared = rawNodes.map((n) => ({
    ...n,
    position: hasPositions && n.position ? n.position : { x: 0, y: 0 },
  }));

  if (!hasPositions) {
    layoutTree(prepared, rawEdges);
  }

  return prepared.map((n) => ({
    id: String(n.id),
    type: 'default',
    position: n.position,
    data: {
      label: n.label || n.data?.label || `Nodo ${n.id}`,
      metadata: n.metadata || n.data?.metadata || null,
      nodeType: n.type || 'detail',
    },
    style: NODE_STYLES[n.type] || NODE_STYLES.detail,
  }));
}

function transformEdges(rawEdges) {
  return rawEdges.map((e, i) => ({
    id: e.id || `e-${i}`,
    source: String(e.source),
    target: String(e.target),
  }));
}

function MindMapInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getNodes } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [analysis, setAnalysis] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const saveTimer = useRef(null);
  const rawDataRef = useRef(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    analysisApi.detail(id).then(({ data }) => {
      setAnalysis(data);
      if (data.mind_map_data) {
        const rawNodes = data.mind_map_data.nodes || [];
        const rawEdges = data.mind_map_data.edges || [];
        rawDataRef.current = { rawNodes, rawEdges };
        setNodes(transformNodes(rawNodes, rawEdges));
        setEdges(transformEdges(rawEdges));
      }
    });
  }, [id]);

  const doSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const currentNodes = getNodes();
      if (currentNodes.length === 0) return;
      const saveNodes = currentNodes.map((n) => ({
        id: n.id,
        type: n.data?.nodeType || 'detail',
        label: n.data?.label || '',
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        metadata: n.data?.metadata || null,
      }));
      const currentEdges = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }));
      mindmapApi.autoSave(id, { nodes: saveNodes, edges: currentEdges }).catch(() => {});
    }, 2000);
  }, [id, edges, getNodes]);

  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    const dragEnd = changes.some((c) => c.type === 'position' && c.dragging === false);
    if (dragEnd) doSave();
  }, [onNodesChange, doSave]);

  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(node);
    setContextMenu(null);
  }, []);

  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, node });
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setContextMenu(null);
  }, []);

  // HU-15: colapsar/expandir el subárbol de un nodo (ocultar/mostrar sus descendientes)
  const getDescendants = useCallback((nodeId, eds) => {
    const childrenMap = {};
    eds.forEach((e) => { (childrenMap[e.source] = childrenMap[e.source] || []).push(e.target); });
    const result = new Set();
    const stack = [...(childrenMap[nodeId] || [])];
    while (stack.length) {
      const cur = stack.pop();
      if (result.has(cur)) continue;
      result.add(cur);
      (childrenMap[cur] || []).forEach((c) => stack.push(c));
    }
    return result;
  }, []);

  const toggleCollapse = useCallback((nodeId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      const hidden = new Set();
      next.forEach((cid) => getDescendants(cid, edges).forEach((d) => hidden.add(d)));
      setNodes((nds) => nds.map((n) => ({
        ...n,
        hidden: hidden.has(n.id),
        style: {
          ...(NODE_STYLES[n.data?.nodeType] || NODE_STYLES.detail),
          ...(next.has(n.id) ? { outline: '2px dashed #64748b', outlineOffset: '2px' } : {}),
        },
      })));
      setEdges((eds) => eds.map((e) => ({ ...e, hidden: hidden.has(e.source) || hidden.has(e.target) })));
      return next;
    });
    setContextMenu(null);
  }, [edges, getDescendants, setNodes, setEdges]);

  const handleRename = async (nodeId, newLabel) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, label: newLabel } } : n));
    await mindmapApi.renameNode(id, { node_id: nodeId, new_label: newLabel });
    setContextMenu(null);
  };

  const handleDeleteNode = async (nodeId) => {
    await mindmapApi.deleteNode(id, { node_id: nodeId });
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setContextMenu(null);
  };

  const handleGenerateNode = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      const body = { prompt };
      if (selectedNode?.id) body.parent_node_id = selectedNode.id;
      const { data } = await mindmapApi.generateNode(id, body);
      if (data.node) {
        const current = getNodes();
        const parent = current.find((n) => n.id === data.edge?.source);
        const pos = parent
          ? { x: parent.position.x + 300, y: parent.position.y + 60 }
          : { x: 0, y: 0 };
        const rfNode = {
          id: String(data.node.id),
          type: 'default',
          position: pos,
          data: {
            label: data.node.label,
            metadata: data.node.metadata || null,
            nodeType: data.node.type || 'ai_generated',
          },
          style: NODE_STYLES[data.node.type] || NODE_STYLES.ai_generated,
        };
        setNodes((nds) => [...nds, rfNode]);
        if (data.edge) {
          setEdges((eds) => [...eds, {
            id: `e-ai-${data.node.id}`,
            source: String(data.edge.source),
            target: String(data.edge.target),
          }]);
        }
      }
      setPrompt('');
    } catch { setActionError('No se pudo generar el nodo. Inténtalo de nuevo.'); }
    setGenerating(false);
  };

  const handleReorganize = () => {
    if (!rawDataRef.current) return;
    const { rawNodes, rawEdges } = rawDataRef.current;
    const fresh = rawNodes.map((n) => ({ ...n, position: { x: 0, y: 0 } }));
    layoutTree(fresh, rawEdges);
    setNodes(transformNodes(fresh, rawEdges));
  };

  const getCanvasImage = async () => {
    const currentNodes = getNodes();
    if (currentNodes.length === 0) return null;
    const bounds = getNodesBounds(currentNodes);
    const viewport = getViewportForBounds(bounds, IMAGE_WIDTH, IMAGE_HEIGHT, 0.5, 2, 0.2);
    const el = document.querySelector('.react-flow__viewport');
    if (!el) return null;
    const render = toPng(el, {
      backgroundColor: '#e8e3de',
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      pixelRatio: 1,
      skipFonts: true,          // evita descargar/incrustar fuentes externas (fuente de 404 y lentitud)
      filter: (n) => n?.tagName !== 'IFRAME' && n?.tagName !== 'SCRIPT',
      style: {
        width: `${IMAGE_WIDTH}px`,
        height: `${IMAGE_HEIGHT}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
    });
    // Timeout de seguridad: si el navegador no logra rasterizar, no dejamos la UI colgada.
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('canvas-timeout')), CANVAS_TIMEOUT_MS)
    );
    return Promise.race([render, timeout]);
  };

  const handleExportImage = async () => {
    setExporting(true);
    try {
      const dataUrl = await getCanvasImage();
      if (!dataUrl) return;
      const link = document.createElement('a');
      link.download = `${analysis?.title || 'mapa-mental'}.png`;
      link.href = dataUrl;
      link.click();
    } catch { setActionError('No se pudo exportar la imagen.'); }
    setExporting(false);
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      let dataUrl = null;
      try { dataUrl = await getCanvasImage(); } catch { dataUrl = null; } // si la imagen falla, seguimos con el contenido
      const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });

      // --- Página 1: mapa mental (horizontal, ajustado a la página) ---
      const lW = pdf.internal.pageSize.getWidth();
      const lH = pdf.internal.pageSize.getHeight();
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(0, 0, 0);
      pdf.text(analysis?.title || 'Mapa mental', 40, 40);
      if (dataUrl) {
        const availW = lW - 80, availH = lH - 80;
        const ratio = IMAGE_HEIGHT / IMAGE_WIDTH;
        let iw = availW, ih = availW * ratio;
        if (ih > availH) { ih = availH; iw = availH / ratio; }
        pdf.addImage(dataUrl, 'PNG', (lW - iw) / 2, 60, iw, ih);
      } else {
        pdf.setFont('helvetica', 'italic'); pdf.setFontSize(11); pdf.setTextColor(120, 120, 120);
        pdf.text('No se pudo generar la imagen del mapa; a continuación se incluye el contenido.', 40, 80);
        pdf.setTextColor(0, 0, 0);
      }

      // --- Páginas siguientes: contenido de los nodos, agrupado por categoría ---
      const liveNodes = getNodes().map((n) => ({
        id: n.id, type: n.data?.nodeType || 'detail', label: n.data?.label || '', metadata: n.data?.metadata || {},
      }));
      const byId = {}; liveNodes.forEach((n) => { byId[n.id] = n; });

      // Resuelve la explicación/texto original de cada nodo con el mismo criterio que NodeModal:
      // metadata inline o, para fundamentos, el registro correspondiente en analysis.findings.
      const findings = analysis?.findings || [];
      const resolveContent = (nd) => {
        const md = nd.metadata || {};
        const finding = findings.find(
          (f) => f.node_id === nd.id || (md.fundamento_num && f.fundamento_num === md.fundamento_num)
        );
        return {
          summary: md.summary || md.simplified || finding?.simplified_text || null,
          original: md.original || finding?.texto || null,
        };
      };
      const categoryNodes = liveNodes.filter((n) => n.type === 'category').sort((a, b) => {
        const ai = CATEGORY_ORDER.findIndex((c) => a.id.startsWith(c));
        const bi = CATEGORY_ORDER.findIndex((c) => b.id.startsWith(c));
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      pdf.addPage('a4', 'portrait');
      const pW = pdf.internal.pageSize.getWidth();
      const pH = pdf.internal.pageSize.getHeight();
      const M = 45, CW = pW - M * 2;
      let y = M;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); pdf.setTextColor(0, 0, 0);
      pdf.text('Contenido del análisis', M, y); y += 28;

      const ensure = (need) => { if (y + need > pH - M) { pdf.addPage('a4', 'portrait'); y = M; } };
      const printed = new Set();

      const printNode = (nd, indent) => {
        const { summary, original } = resolveContent(nd);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(0, 0, 0);
        const tl = pdf.splitTextToSize(`- ${nd.label || ''}`, CW - indent);
        ensure(tl.length * 14 + 6); pdf.text(tl, M + indent, y); y += tl.length * 14 + 2;
        if (summary) {
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(45, 45, 45);
          const sl = pdf.splitTextToSize(summary, CW - indent - 8);
          ensure(sl.length * 13 + 4); pdf.text(sl, M + indent + 8, y); y += sl.length * 13 + 4;
        }
        if (original) {
          pdf.setFont('helvetica', 'italic'); pdf.setFontSize(9); pdf.setTextColor(105, 105, 105);
          const ol = pdf.splitTextToSize(`"${original}"`, CW - indent - 8);
          ensure(ol.length * 12 + 6); pdf.text(ol, M + indent + 8, y); y += ol.length * 12 + 6;
        }
        pdf.setTextColor(0, 0, 0); y += 6;
      };

      // Descendientes en orden natural (pre-orden, respetando el orden de los hijos), para que
      // los fundamentos aparezcan 1, 2, 3… y no invertidos como haría el Set de getDescendants.
      const childrenMap = {};
      edges.forEach((e) => { (childrenMap[e.source] = childrenMap[e.source] || []).push(e.target); });
      const orderedDescendants = (rootId) => {
        const out = [], seen = new Set();
        const walk = (nid) => {
          for (const c of (childrenMap[nid] || [])) {
            if (seen.has(c)) continue;
            seen.add(c); out.push(c); walk(c);
          }
        };
        walk(rootId);
        return out;
      };

      for (const cat of categoryNodes) {
        ensure(34);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(0, 112, 192);
        const hl = pdf.splitTextToSize(cat.label || 'Categoría', CW);
        pdf.text(hl, M, y); y += hl.length * 16 + 4; pdf.setTextColor(0, 0, 0);
        const desc = orderedDescendants(cat.id);
        let any = false;
        for (const did of desc) {
          const nd = byId[did]; if (!nd) continue;
          printNode(nd, 10); printed.add(did); any = true;
        }
        if (!any) {
          pdf.setFont('helvetica', 'italic'); pdf.setFontSize(10); pdf.setTextColor(120, 120, 120);
          ensure(16); pdf.text('(sin detalle)', M + 10, y); y += 18; pdf.setTextColor(0, 0, 0);
        }
        y += 8;
      }

      // Nodos con contenido que no cuelgan de una categoría (p. ej. agregados con IA)
      const leftovers = liveNodes.filter((n) => {
        if (n.type === 'central' || n.type === 'category' || printed.has(n.id)) return false;
        const c = resolveContent(n);
        return c.summary || c.original;
      });
      if (leftovers.length) {
        ensure(30); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(0, 112, 192);
        pdf.text('Otros nodos', M, y); y += 20; pdf.setTextColor(0, 0, 0);
        leftovers.forEach((n) => printNode(n, 10));
      }

      pdf.save(`${analysis?.title || 'mapa-mental'}.pdf`);
    } catch { setActionError('No se pudo exportar el PDF.'); }
    setExporting(false);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const { data } = await mindmapApi.regenerate(id);
      const rawNodes = data.nodes || [];
      const rawEdges = data.edges || [];
      rawDataRef.current = { rawNodes, rawEdges };
      setNodes(transformNodes(rawNodes, rawEdges));
      setEdges(transformEdges(rawEdges));
    } catch { setActionError('No se pudo regenerar el mapa mental.'); }
    setRegenerating(false);
  };

  const minimapColor = (node) => {
    const t = node.data?.nodeType;
    if (t === 'central') return '#1e293b';
    if (t === 'category') return '#334155';
    if (t === 'fundamento') return '#f59e0b';
    return '#93c5fd';
  };

  return (
    <div className={styles.page}>
      <header className={styles.toolbar}>
        <button className={styles.backBtn} onClick={() => navigate('/history')}>
          <ArrowLeft size={14} /> Volver
        </button>
        <span className={styles.title}>
          {analysis?.title || 'Análisis'}
        </span>
        <div className={styles.toolbarActions}>
          <button className={styles.toolBtn} onClick={handleReorganize}><Pencil size={14} /> Reorganizar</button>
          <button className={styles.toolBtn} onClick={handleExportImage} disabled={exporting}>
            <Image size={14} /> Imagen
          </button>
          <button className={styles.toolBtn} onClick={handleExportPDF} disabled={exporting}>
            <Download size={14} /> Exportar PDF
          </button>
        </div>
      </header>

      {actionError && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '8px 16px', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #fecaca' }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontWeight: 600 }}>✕</button>
        </div>
      )}

      <div className={styles.workspace}>
        <div className={styles.canvas}>
          {analysis && nodes.length === 0 && !regenerating && (
            <div className={styles.emptyMap}>
              <p>El mapa mental no tiene nodos. Esto puede ocurrir si los datos se corrompieron.</p>
              <button className={styles.regenerateBtn} onClick={handleRegenerate}>
                <RefreshCw size={16} /> Regenerar mapa mental
              </button>
            </div>
          )}
          {regenerating && (
            <div className={styles.emptyMap}>
              <RefreshCw size={24} className={styles.spinning} />
              <p>Regenerando mapa mental... Esto puede tardar unos minutos.</p>
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={(_, node) => toggleCollapse(node.id)}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={onPaneClick}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            minZoom={0.1}
            maxZoom={2.5}
          >
            <Background color="#ddd" gap={20} />
            <Controls showInteractive={false} />
            <MiniMap nodeColor={minimapColor} maskColor="rgba(245,240,235,0.8)" />
          </ReactFlow>

          {contextMenu && (
            <NodeContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              node={contextMenu.node}
              isCollapsed={collapsed.has(contextMenu.node.id)}
              onRename={handleRename}
              onDelete={handleDeleteNode}
              onToggleCollapse={toggleCollapse}
              onViewExplanation={() => { setSelectedNode(contextMenu.node); setContextMenu(null); }}
              onClose={() => setContextMenu(null)}
            />
          )}
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.sideSection}>
            <h3 className={styles.sideLabel}>Generar nodo con IA</h3>
            <textarea className={styles.promptInput} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ej.: Agrega un nodo sobre el voto singular del magistrado..." />
            <button className={styles.generateBtn} onClick={handleGenerateNode} disabled={generating || !prompt.trim()}>
              <Sparkles size={14} /> {generating ? 'Generando...' : '+ Generar nodo'}
            </button>
          </div>

          <div className={styles.sideSection}>
            <h3 className={styles.sideLabel}>Documentos analizados</h3>
            {analysis?.documents?.map((doc) => (
              <div key={doc.id} className={styles.docItem}>
                <FileText size={14} />
                <span>{doc.original_filename}</span>
              </div>
            ))}
          </div>

          <div className={styles.sideSection}>
            <h3 className={styles.sideLabel}>Leyenda</h3>
            <div className={styles.legend}>
              <span><span className={styles.legendDot} style={{ background: '#1e293b' }} /> Sentencia</span>
              <span><span className={styles.legendDot} style={{ background: '#fff', border: '2px solid #334155' }} /> Categoría</span>
              <span><span className={styles.legendDot} style={{ background: '#fef3c7', border: '1px solid #f59e0b' }} /> Fundamento</span>
              <span><span className={styles.legendDot} style={{ background: '#f0f9ff', border: '1px solid #93c5fd' }} /> Detalle</span>
            </div>
          </div>
        </aside>
      </div>

      {selectedNode && (
        <NodeModal
          node={selectedNode}
          analysisId={id}
          analysis={analysis}
          findings={analysis?.findings}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}

export default function MindMap() {
  return (
    <ReactFlowProvider>
      <MindMapInner />
    </ReactFlowProvider>
  );
}
