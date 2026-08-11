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

const IMAGE_WIDTH = 4096;
const IMAGE_HEIGHT = 3072;

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
    } catch { /* ignore */ }
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
    return toPng(el, {
      backgroundColor: '#e8e3de',
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      style: {
        width: `${IMAGE_WIDTH}px`,
        height: `${IMAGE_HEIGHT}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
    });
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
    } catch { /* ignore */ }
    setExporting(false);
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const dataUrl = await getCanvasImage();
      if (!dataUrl) return;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [IMAGE_WIDTH, IMAGE_HEIGHT] });

      pdf.setFillColor(232, 227, 222);
      pdf.rect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT, 'F');
      pdf.addImage(dataUrl, 'PNG', 0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);

      const relevantes = (analysis?.findings || []).filter((f) => f.is_selected);
      if (relevantes.length > 0) {
        pdf.addPage([842, 595], 'portrait');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(20);
        pdf.text('Explicaciones de los nodos', 40, 50);

        let y = 80;
        pdf.setFontSize(11);
        for (const f of relevantes) {
          if (y > 550) { pdf.addPage([842, 595], 'portrait'); y = 50; }
          pdf.setFont('helvetica', 'bold');
          pdf.text(`Fundamento ${f.fundamento_num}`, 40, y);
          y += 16;
          pdf.setFont('helvetica', 'normal');
          const text = f.simplified_text || f.texto || '';
          const lines = pdf.splitTextToSize(text, 760);
          pdf.text(lines, 40, y);
          y += lines.length * 14 + 20;
        }
      }

      pdf.save(`${analysis?.title || 'mapa-mental'}.pdf`);
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
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
              onRename={handleRename}
              onDelete={handleDeleteNode}
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
