import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider, useNodesInitialized,
  getNodesBounds, getViewportForBounds, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { ArrowLeft, LayoutGrid, Image, FileText, Sparkles, Plus, Download, RefreshCw, Loader2 } from 'lucide-react';
import { analysisApi, mindmapApi } from '../services/api';
import AppHeader from '../components/AppHeader';
import NodeModal from '../components/NodeModal';
import { findFinding } from '../utils/findings';
import NodeContextMenu from '../components/NodeContextMenu';
import styles from './MindMap.module.css';

// 2048x1536 (~3.1 MP): nítido para A4 y dentro del límite de rasterización SVG→imagen del
// navegador. Valores mayores (p. ej. 4096x3072) hacen que html-to-image nunca dispare onload
// y la exportación quede colgada.
const IMAGE_WIDTH = 2048;
const IMAGE_HEIGHT = 1536;
const CANVAS_TIMEOUT_MS = 20000;
const CANVAS_BG = '#eceff4';
// HU-21: un mapa grande no se reduce por debajo de este zoom (el texto de los nodos quedaría ilegible).
// En su lugar la imagen crece; como el navegador no rasteriza más de ~3 MP de una vez, se genera
// por franjas y se unen en un canvas. Esos mapas se exportan al doble de resolución, para que el
// texto se lea nítido al ampliar la imagen.
const MIN_READABLE_ZOOM = 0.75;
const MAX_TILE_PIXELS = 3_000_000;
const LARGE_MAP_PIXEL_RATIO = 2;
const EXPORT_PADDING = 0.2;

const CATEGORY_ORDER = ['materia', 'partes', 'pretension', 'antecedentes', 'fundamentos', 'fallo', 'votos'];

/* ---------- Paleta del mapa (solo presentación) ---------- */
const INK = '#1b2c4a';
const GOLD = '#b1863a';
const NEUTRAL = '#5a6577';

const CATEGORY_COLORS = {
  materia: '#4a6a99',
  partes: '#3f7d72',
  pretension: '#6a5a92',
  antecedentes: '#b0863f',
  fundamentos: '#9a4a58',
  fallo: GOLD,
  votos: '#4a7d55',
};

const SUB_COLORS = {
  fundamento: '#b0863f',
  detail: '#4a6a99',
  ai_generated: '#6a5a92',
};

const hexToRgb = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};

const mixHex = (a, b, t) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v * (1 - t) + B[i] * t).toString(16).padStart(2, '0')).join('');
};

const categoryColor = (nodeId) => {
  const key = CATEGORY_ORDER.find((c) => String(nodeId).startsWith(c));
  return (key && CATEGORY_COLORS[key]) || NEUTRAL;
};

const nodeColor = (rawNode) => {
  const t = rawNode.type || 'detail';
  if (t === 'central') return INK;
  if (t === 'category') return categoryColor(rawNode.id);
  return SUB_COLORS[t] || SUB_COLORS.detail;
};

const NODE_STYLES = {
  central: {
    background: `linear-gradient(155deg, ${mixHex(INK, '#ffffff', 0.16)}, ${INK} 70%)`,
    color: '#f6efdf',
    fontFamily: "'Bebas Neue', Impact, 'Arial Narrow', sans-serif",
    fontWeight: 400,
    fontSize: '24px',
    letterSpacing: '0.05em',
    lineHeight: 1.12,
    padding: '16px 26px',
    borderRadius: '20px',
    border: 'none',
    minWidth: '230px',
    maxWidth: '320px',
    textAlign: 'center',
    boxShadow: '0 0 0 4px rgba(177,134,58,0.26), 0 0 0 14px rgba(177,134,58,0.07), 0 20px 44px rgba(20,32,54,0.28)',
  },
  category: {
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '14px',
    lineHeight: 1.25,
    padding: '13px 20px',
    borderRadius: '14px',
    border: 'none',
    minWidth: '156px',
    maxWidth: '215px',
    textAlign: 'center',
  },
  sub: {
    background: '#ffffff',
    fontWeight: 500,
    fontSize: '12.5px',
    lineHeight: 1.35,
    padding: '11px 15px 11px 27px',
    borderRadius: '11px',
    border: '1px solid',
    maxWidth: '215px',
    textAlign: 'left',
  },
};

function buildNodeStyle(rawNode) {
  const t = rawNode.type || 'detail';
  const color = nodeColor(rawNode);

  if (t === 'central') {
    return { ...NODE_STYLES.central, '--dot': GOLD };
  }
  if (t === 'category') {
    const isGold = color === GOLD;
    return {
      ...NODE_STYLES.category,
      background: `linear-gradient(180deg, ${mixHex(color, '#ffffff', 0.1)}, ${color})`,
      color: isGold ? INK : '#ffffff',
      boxShadow: isGold
        ? `0 12px 26px ${color}33, 0 0 0 3px rgba(177,134,58,0.33), 0 0 0 9px rgba(177,134,58,0.08)`
        : `0 10px 24px ${color}40`,
      '--dot': color,
    };
  }
  return {
    ...NODE_STYLES.sub,
    borderColor: mixHex(color, CANVAS_BG, 0.55),
    color: mixHex(color, INK, 0.3),
    boxShadow: `0 6px 16px ${color}1f`,
    '--dot': color,
  };
}

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

  const validPos = (p) => p && typeof p.x === 'number' && typeof p.y === 'number';
  const prepared = rawNodes.map((n) => ({
    ...n,
    position: hasPositions && validPos(n.position) ? n.position : { x: 0, y: 0 },
  }));

  if (!hasPositions) {
    layoutTree(prepared, rawEdges);
  } else {
    // HU-17: un nodo guardado sin posición (p. ej. uno generado con IA) se ubica junto a su padre,
    // en lugar de caer en el origen del lienzo, encima del nodo raíz.
    const byId = {};
    prepared.forEach((n) => { byId[n.id] = n; });
    const parentOf = {};
    rawEdges.forEach((e) => { parentOf[e.target] = e.source; });
    const placed = {};
    rawNodes.forEach((raw, i) => {
      if (validPos(raw.position)) return;
      const parent = byId[parentOf[raw.id]];
      if (!parent) return;
      placed[parent.id] = (placed[parent.id] || 0) + 1;
      prepared[i].position = { x: parent.position.x + 300, y: parent.position.y + 60 * placed[parent.id] };
    });
  }

  return prepared.map((n) => {
    const nodeType = n.type || 'detail';
    const isSub = nodeType !== 'central' && nodeType !== 'category';
    return {
      id: String(n.id),
      type: 'default',
      position: n.position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      className: isSub ? 'jmSub' : undefined,
      data: {
        label: n.label || n.data?.label || `Nodo ${n.id}`,
        metadata: n.metadata || n.data?.metadata || null,
        nodeType,
      },
      style: buildNodeStyle({ ...n, type: nodeType }),
    };
  });
}

function edgeStyle(targetRawNode) {
  const color = targetRawNode ? nodeColor(targetRawNode) : NEUTRAL;
  const isCategory = targetRawNode?.type === 'category';
  return {
    stroke: mixHex(color, CANVAS_BG, 0.2),
    strokeWidth: isCategory ? 2.2 : 1.7,
  };
}

function transformEdges(rawEdges, rawNodes = []) {
  const byId = {};
  rawNodes.forEach((n) => { byId[String(n.id)] = n; });
  return rawEdges.map((e, i) => ({
    id: e.id || `e-${i}`,
    source: String(e.source),
    target: String(e.target),
    style: edgeStyle(byId[String(e.target)]),
  }));
}

const defaultEdgeOptions = {
  type: 'bezier',
  style: { stroke: mixHex(NEUTRAL, CANVAS_BG, 0.35), strokeWidth: 1.7 },
};

function MindMapInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getNodes, getEdges } = useReactFlow();
  const [searchParams, setSearchParams] = useSearchParams();
  const nodesInitialized = useNodesInitialized();
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
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [actionError, setActionError] = useState('');
  const [confirmDeleteNode, setConfirmDeleteNode] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [promptError, setPromptError] = useState('');

  useEffect(() => {
    analysisApi.detail(id).then(({ data }) => {
      setAnalysis(data);
      if (data.mind_map_data) {
        const rawNodes = data.mind_map_data.nodes || [];
        const rawEdges = data.mind_map_data.edges || [];
        setNodes(transformNodes(rawNodes, rawEdges));
        setEdges(transformEdges(rawEdges, rawNodes));
      }
    }).catch(() => {
      // HU-24: si falla la carga del análisis, informar en vez de dejar la pantalla vacía.
      setLoadError('No se pudo cargar el análisis. Es posible que no exista o que haya ocurrido un problema al recuperarlo.');
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
      // Se leen las conexiones al momento de guardar (no las de la última renderización): así no se
      // pierde una conexión recién creada, como la de un nodo generado con IA (HU-17).
      const currentEdges = getEdges().map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }));
      mindmapApi.autoSave(id, { nodes: saveNodes, edges: currentEdges }).catch(() => {});
    }, 2000);
  }, [id, getNodes, getEdges]);

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
          // se conserva el estilo del nodo (color de rama) y solo se marca el colapso
          ...n.style,
          outline: next.has(n.id) ? `2px dashed ${GOLD}` : 'none',
          outlineOffset: '3px',
        },
      })));
      setEdges((eds) => eds.map((e) => ({ ...e, hidden: hidden.has(e.source) || hidden.has(e.target) })));
      return next;
    });
    setContextMenu(null);
  }, [edges, getDescendants, setNodes, setEdges]);

  const handleRename = async (nodeId, newLabel) => {
    const previous = getNodes().find((n) => n.id === nodeId)?.data?.label;
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, label: newLabel } } : n));
    setContextMenu(null);
    try {
      await mindmapApi.renameNode(id, { node_id: nodeId, new_label: newLabel });
    } catch {
      // HU-32: si no se guarda, se devuelve el nombre anterior y se orienta al estudiante.
      setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, label: previous } } : n));
      setActionError('No se pudo renombrar el nodo. Revisa tu conexión e inténtalo de nuevo.');
    }
  };

  const handleDeleteNode = async (nodeId) => {
    setContextMenu(null);
    try {
      await mindmapApi.deleteNode(id, { node_id: nodeId });
    } catch {
      setActionError('No se pudo eliminar el nodo. Inténtalo de nuevo.');
      return;
    }
    // HU-19: el backend elimina el nodo Y todo su subárbol, así que la pantalla debe hacer lo mismo.
    // Si solo se quitara el nodo, sus hijos quedarían huérfanos en el lienzo y el siguiente guardado
    // automático los volvería a escribir en la base de datos.
    const removed = new Set([nodeId, ...getDescendants(nodeId, edges)]);
    setNodes((nds) => nds.filter((n) => !removed.has(n.id)));
    setEdges((eds) => eds.filter((e) => !removed.has(e.source) && !removed.has(e.target)));
    setCollapsed((prev) => new Set([...prev].filter((cid) => !removed.has(cid))));
    setSelectedNode((sel) => (sel && removed.has(sel.id) ? null : sel));
  };

  const handleGenerateNode = async () => {
    if (!prompt.trim()) {
      // HU-17: avisar que el prompt es obligatorio en vez de ignorar el clic en silencio.
      setPromptError('Escribe una instrucción para generar el nodo.');
      return;
    }
    setPromptError('');
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
        const rawNew = { ...data.node, type: data.node.type || 'ai_generated' };
        const rfNode = {
          id: String(data.node.id),
          type: 'default',
          position: pos,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          className: 'jmSub',
          data: {
            label: data.node.label,
            metadata: data.node.metadata || null,
            nodeType: rawNew.type,
          },
          style: buildNodeStyle(rawNew),
        };
        setNodes((nds) => [...nds, rfNode]);
        if (data.edge) {
          setEdges((eds) => [...eds, {
            id: `e-ai-${data.node.id}`,
            source: String(data.edge.source),
            target: String(data.edge.target),
            style: edgeStyle(rawNew),
          }]);
        }
        // HU-17: guardar de inmediato la posición del nodo nuevo; el backend lo crea sin posición y,
        // al volver a abrir el mapa, aparecería en el origen, encima del nodo raíz.
        doSave();
      }
      setPrompt('');
    } catch { setActionError('No se pudo generar el nodo. Inténtalo de nuevo.'); }
    setGenerating(false);
  };

  const handleReorganize = () => {
    // Reorganiza el mapa ACTUAL (con nodos renombrados, generados o eliminados), no los datos
    // originales de la carga: con esos, un nodo eliminado (HU-19) reaparecía al reorganizar.
    const current = getNodes();
    if (current.length === 0) return;
    const raw = current.map((n) => ({
      id: n.id,
      type: n.data?.nodeType || 'detail',
      label: n.data?.label || '',
      metadata: n.data?.metadata || null,
      position: { x: 0, y: 0 },
    }));
    const rawEdges = edges.map((e) => ({ source: e.source, target: e.target }));
    layoutTree(raw, rawEdges);
    const hiddenIds = new Set(current.filter((n) => n.hidden).map((n) => n.id));
    setNodes(transformNodes(raw, rawEdges).map((n) => ({
      ...n,
      hidden: hiddenIds.has(n.id),
      style: { ...n.style, outline: collapsed.has(n.id) ? `2px dashed ${GOLD}` : 'none', outlineOffset: '3px' },
    })));
    // HU-20: la nueva disposición se guarda automáticamente, igual que al mover un nodo.
    doSave();
  };

  // Rasteriza un recorte del lienzo (w x h) con la traslación y el zoom indicados.
  const renderRegion = (el, w, h, tx, ty, zoom, pixelRatio) => {
    const render = toPng(el, {
      backgroundColor: CANVAS_BG,
      width: w,
      height: h,
      pixelRatio,
      skipFonts: true,          // evita descargar/incrustar fuentes externas (fuente de 404 y lentitud)
      filter: (n) => n?.tagName !== 'IFRAME' && n?.tagName !== 'SCRIPT',
      style: {
        width: `${w}px`,
        height: `${h}px`,
        transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
      },
    });
    // Timeout de seguridad: si el navegador no logra rasterizar, no dejamos la UI colgada.
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('canvas-timeout')), CANVAS_TIMEOUT_MS)
    );
    return Promise.race([render, timeout]);
  };

  // Devuelve { dataUrl, width, height } con TODO el mapa visible (HU-21).
  const getCanvasImage = async () => {
    const visibles = getNodes().filter((n) => !n.hidden);
    if (visibles.length === 0) return null;
    const el = document.querySelector('.react-flow__viewport');
    if (!el) return null;
    const b = getNodesBounds(visibles);
    const fitZoom = Math.min(
      IMAGE_WIDTH / (b.width * (1 + EXPORT_PADDING)),
      IMAGE_HEIGHT / (b.height * (1 + EXPORT_PADDING)),
      2,
    );

    // Mapa normal: entra en 2048x1536 con un zoom legible (igual que antes).
    if (fitZoom >= MIN_READABLE_ZOOM) {
      const vp = getViewportForBounds(b, IMAGE_WIDTH, IMAGE_HEIGHT, MIN_READABLE_ZOOM, 2, EXPORT_PADDING);
      const dataUrl = await renderRegion(el, IMAGE_WIDTH, IMAGE_HEIGHT, vp.x, vp.y, vp.zoom, 1);
      return { dataUrl, width: IMAGE_WIDTH, height: IMAGE_HEIGHT };
    }

    // Mapa grande: zoom mínimo legible y una imagen del tamaño que haga falta, generada por franjas.
    const zoom = MIN_READABLE_ZOOM;
    const pr = LARGE_MAP_PIXEL_RATIO;
    const width = Math.ceil(b.width * zoom * (1 + EXPORT_PADDING));
    const height = Math.ceil(b.height * zoom * (1 + EXPORT_PADDING));
    const tx = -b.x * zoom + (width - b.width * zoom) / 2;
    const ty = -b.y * zoom + (height - b.height * zoom) / 2;
    const band = Math.max(200, Math.floor(MAX_TILE_PIXELS / (width * pr * pr)));
    const canvas = document.createElement('canvas');
    canvas.width = width * pr;
    canvas.height = height * pr;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let top = 0; top < height; top += band) {
      const h = Math.min(band, height - top);
      const part = new window.Image(); // `Image` a secas es el ícono de lucide-react importado arriba
      part.src = await renderRegion(el, width, h, tx, ty - top, zoom, pr);
      await part.decode();
      ctx.drawImage(part, 0, top * pr);
    }
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  };

  const handleExportImage = async () => {
    // HU-31: el botón indica que la imagen se está generando y vuelve a su estado al terminar.
    setExporting('image');
    try {
      const img = await getCanvasImage();
      if (!img) return;
      const link = document.createElement('a');
      link.download = `${analysis?.title || 'mapa-mental'}.png`;
      link.href = img.dataUrl;
      link.click();
    } catch {
      setActionError('No se pudo exportar la imagen. Inténtalo de nuevo o usa «Exportar PDF».');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setExporting('pdf');
    try {
      let img = null;
      try { img = await getCanvasImage(); } catch { img = null; } // si la imagen falla, seguimos con el contenido
      const tall = !!img && img.height > img.width;
      const orientation = tall ? 'portrait' : 'landscape';
      const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation });

      // --- Primeras páginas: mapa mental ---
      const lW = pdf.internal.pageSize.getWidth();
      const lH = pdf.internal.pageSize.getHeight();
      const titulo = analysis?.title || 'Mapa mental';
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(0, 0, 0);
      pdf.text(titulo, 40, 40);
      if (img) {
        const top = 60;
        const availW = lW - 80, availH = lH - top - 40;
        const ratio = img.height / img.width;
        let iw = availW, ih = availW * ratio;
        if (ih <= availH || !tall) {
          // Mapa normal: una sola página horizontal, ajustado a la página (igual que antes).
          if (ih > availH) { ih = availH; iw = availH / ratio; }
          // Compresión 'FAST': sin ella la imagen se incrusta sin comprimir y el PDF pesa varios MB.
          pdf.addImage(img.dataUrl, 'PNG', (lW - iw) / 2, top, iw, ih, undefined, 'FAST');
        } else {
          // HU-21: mapa alto. Se reparte en varias páginas verticales a ancho completo, en lugar de
          // achicarlo hasta que no se lea. La imagen se incrusta una sola vez (alias) y cada página
          // muestra su franja; márgenes en blanco tapan lo que queda fuera de la franja.
          const pages = Math.ceil(ih / availH);
          for (let i = 0; i < pages; i++) {
            if (i > 0) pdf.addPage('a4', orientation);
            // Compresión 'FAST': sin ella, la imagen grande se incrusta sin comprimir (más de 20 MB).
            pdf.addImage(img.dataUrl, 'PNG', 40, top - i * availH, iw, ih, 'mapa-mental', 'FAST');
            pdf.setFillColor(255, 255, 255);
            pdf.rect(0, 0, lW, top - 4, 'F');
            pdf.rect(0, top + availH, lW, lH - top - availH, 'F');
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(i === 0 ? 16 : 12); pdf.setTextColor(0, 0, 0);
            pdf.text(i === 0 ? titulo : `${titulo} (mapa, parte ${i + 1} de ${pages})`, 40, 40);
          }
        }
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
        const finding = findFinding(findings, nd.id, md);
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
    } catch {
      setActionError('No se pudo exportar el PDF. Espera unos segundos e inténtalo de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const { data } = await mindmapApi.regenerate(id);
      const rawNodes = data.nodes || [];
      const rawEdges = data.edges || [];
      setNodes(transformNodes(rawNodes, rawEdges));
      setEdges(transformEdges(rawEdges, rawNodes));
    } catch { setActionError('No se pudo regenerar el mapa mental. Inténtalo de nuevo en unos minutos.'); }
    setRegenerating(false);
  };

  // Exportación pedida desde el historial o el inicio (?export=png|pdf): se lanza sola cuando el mapa
  // terminó de dibujarse (los nodos ya tienen su tamaño medido) y se quita el parámetro de la URL,
  // para que al recargar no se vuelva a descargar.
  const exportHandlers = useRef({});
  useEffect(() => {
    exportHandlers.current = { png: handleExportImage, pdf: handleExportPDF };
  });
  const autoExportLanzado = useRef(false);
  useEffect(() => {
    const tipo = searchParams.get('export');
    if (!tipo || autoExportLanzado.current || !nodesInitialized || nodes.length === 0) return;
    autoExportLanzado.current = true;
    setTimeout(() => {
      setSearchParams({}, { replace: true });
      (exportHandlers.current[tipo] || exportHandlers.current.png)();
    }, 800);
  }, [searchParams, setSearchParams, nodesInitialized, nodes.length]);

  const minimapColor = (node) => {
    const t = node.data?.nodeType;
    if (t === 'central') return INK;
    if (t === 'category') return categoryColor(node.id);
    return SUB_COLORS[t] || SUB_COLORS.detail;
  };

  // HU-24: pantalla de error si el análisis no se pudo cargar.
  if (loadError) {
    return (
      <div className={styles.page}>
        <AppHeader />
        <div className={styles.loadErrorScreen}>
          <h2 className={styles.loadErrorTitle}>No se pudo cargar el análisis</h2>
          <p className={styles.loadErrorText}>{loadError}</p>
          <button className={styles.regenerateBtn} onClick={() => navigate('/history')}>
            Volver al historial
          </button>
        </div>
      </div>
    );
  }

  // Un análisis fallido, cancelado o en curso no tiene mapa: se explica qué pasó en lugar de mostrar
  // un lienzo vacío con la opción de «regenerar» (que volvería a usar la IA sobre un análisis fallido).
  if (analysis && analysis.status && analysis.status !== 'completed') {
    const enCurso = ['pending', 'processing'].includes(analysis.status);
    const titulo = analysis.status === 'failed' ? 'Este análisis no se completó'
      : analysis.status === 'cancelled' ? 'Este análisis fue cancelado'
      : 'Este análisis aún se está procesando';
    const texto = analysis.status === 'failed'
      ? `${analysis.error_message || 'Ocurrió un error durante el procesamiento.'} Puedes crear un nuevo análisis con el mismo documento.`
      : analysis.status === 'cancelled'
        ? 'Se detuvo antes de generar el mapa mental. Puedes crear un nuevo análisis cuando quieras.'
        : 'El mapa mental estará listo en unos momentos.';
    return (
      <div className={styles.page}>
        <AppHeader />
        <div className={styles.loadErrorScreen}>
          <h2 className={styles.loadErrorTitle}>{titulo}</h2>
          <p className={styles.loadErrorText}>{texto}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className={styles.regenerateBtn} onClick={() => navigate(enCurso ? `/processing/${id}` : '/analysis')}>
              {enCurso ? 'Ver progreso' : 'Nuevo análisis'}
            </button>
            <button className={styles.regenerateBtn} onClick={() => navigate('/history')}>
              Volver al historial
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader />

      {actionError && (
        <div className={styles.errorBar}>
          <span>{actionError}</span>
          <button className={styles.errorBarClose} onClick={() => setActionError('')}>✕</button>
        </div>
      )}

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
          fitViewOptions={{ padding: { top: '92px', right: '350px', bottom: '92px', left: '56px' } }}
          minZoom={0.1}
          maxZoom={2.5}
        >
          <Background color="#c3cbdb" gap={26} size={1.6} />
          <Controls showInteractive={false} position="bottom-right" />
          <MiniMap
            nodeColor={minimapColor}
            nodeStrokeWidth={0}
            maskColor="rgba(236,240,246,0.7)"
            position="bottom-left"
            style={{ width: 168, height: 112 }}
          />
        </ReactFlow>

        <div className={styles.floatLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/history')}>
            <ArrowLeft size={15} /> Volver
          </button>
          <span className={styles.sep} />
          <span className={styles.title}>{analysis?.title || 'Análisis'}</span>
        </div>

        <div className={styles.floatRight}>
          <button className={styles.toolBtn} onClick={handleReorganize}>
            <LayoutGrid size={15} /> Reorganizar
          </button>
          <button className={styles.toolBtn} onClick={handleExportImage} disabled={!!exporting}>
            {exporting === 'image'
              ? <><Loader2 size={15} className={styles.spinning} /> Generando imagen...</>
              : <><Image size={15} /> Imagen</>}
          </button>
          <button className={`${styles.toolBtn} ${styles.toolBtnPrimary}`} onClick={handleExportPDF} disabled={!!exporting}>
            {exporting === 'pdf'
              ? <><Loader2 size={15} className={styles.spinning} /> Generando PDF...</>
              : <><Download size={15} /> Exportar PDF</>}
          </button>
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.sideSection}>
            <span className={styles.sideHead}><Sparkles size={16} /> Añadir nodo</span>
            <span className={styles.sideLabel}>Prompt</span>
            <textarea className={styles.promptInput} rows={3} value={prompt}
              onChange={(e) => { setPrompt(e.target.value); if (promptError) setPromptError(''); }}
              placeholder="Ej.: Agrega un nodo sobre el voto singular del magistrado..." />
            {promptError && <div className={styles.fieldError}>{promptError}</div>}
            <button className={styles.generateBtn} onClick={handleGenerateNode} disabled={generating}>
              <Plus size={16} /> {generating ? 'Generando...' : 'Generar nodo'}
            </button>
          </div>

          <div className={styles.divider} />

          <div className={styles.sideSection}>
            <span className={styles.sideLabel}>Documentos analizados</span>
            {analysis?.documents?.map((doc) => (
              <div key={doc.id} className={styles.docItem}>
                <FileText size={15} />
                <span>{doc.original_filename}</span>
              </div>
            ))}
          </div>

          <div className={styles.divider} />

          <div className={styles.sideSection}>
            <span className={styles.sideLabel}>Leyenda</span>
            <div className={styles.legend}>
              <span>
                <span className={styles.legendDot} style={{ background: INK, borderColor: INK }} /> Sentencia
              </span>
              <span>
                <span className={styles.legendDot} style={{ background: CATEGORY_COLORS.partes, borderColor: CATEGORY_COLORS.partes }} /> Categoría
              </span>
              <span>
                <span className={styles.legendDot} style={{ background: '#fff', borderColor: SUB_COLORS.fundamento }} /> Fundamento
              </span>
              <span>
                <span className={styles.legendDot} style={{ background: '#fff', borderColor: SUB_COLORS.detail }} /> Detalle
              </span>
              <span>
                <span className={styles.legendDot} style={{ background: '#fff', borderColor: SUB_COLORS.ai_generated }} /> Nodo con IA
              </span>
            </div>
          </div>
        </aside>

        {contextMenu && (
          <NodeContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            node={contextMenu.node}
            isCollapsed={collapsed.has(contextMenu.node.id)}
            onRename={handleRename}
            onDelete={(nodeId) => { setConfirmDeleteNode({ id: nodeId, label: contextMenu.node.data?.label || '' }); setContextMenu(null); }}
            onToggleCollapse={toggleCollapse}
            onViewExplanation={() => { setSelectedNode(contextMenu.node); setContextMenu(null); }}
            onClose={() => setContextMenu(null)}
          />
        )}
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

      {/* HU-19: confirmación previa antes de eliminar un nodo */}
      {confirmDeleteNode && (
        <div className={styles.overlay} onClick={() => setConfirmDeleteNode(null)}>
          <div className={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>¿Eliminar nodo?</h3>
            <p className={styles.confirmText}>
              Se eliminará «{confirmDeleteNode.label || 'este nodo'}» y sus subnodos. Esta acción no se puede deshacer.
            </p>
            <div className={styles.confirmBtns}>
              <button className={styles.btnGhost} onClick={() => setConfirmDeleteNode(null)}>Cancelar</button>
              <button className={styles.btnDanger}
                onClick={() => { handleDeleteNode(confirmDeleteNode.id); setConfirmDeleteNode(null); }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
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
