import { useEffect, useState } from 'react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { analysisApi } from '../services/api';
import { transformNodes, transformEdges } from '../pages/MindMap';

// Mapas ya pedidos en esta sesión. La clave incluye `version` (fecha de actualización del análisis):
// si el mapa se edita, la vista previa se vuelve a pedir en vez de mostrar la versión anterior.
const cache = new Map();

// Miniatura de solo lectura del mapa mental, con los mismos colores y conexiones que el mapa
// completo. No se puede arrastrar, ampliar ni seleccionar nada: solo muestra cómo es el mapa.
export default function MapPreview({ analysisId, version }) {
  const key = `${analysisId}:${version || ''}`;
  // Solo sirve para volver a dibujar cuando llega un mapa; el mapa en sí se lee de la caché.
  const [, setLoaded] = useState(0);
  const map = cache.get(key);

  useEffect(() => {
    if (cache.has(key)) return undefined;
    let cancelled = false;
    analysisApi.detail(analysisId).then(({ data }) => {
      const raw = data.mind_map_data;
      if (!raw?.nodes?.length) return;
      const rawEdges = raw.edges || [];
      cache.set(key, { nodes: transformNodes(raw.nodes, rawEdges), edges: transformEdges(rawEdges, raw.nodes) });
      if (!cancelled) setLoaded((n) => n + 1);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [analysisId, key]);

  if (!map) return null;
  return (
    <ReactFlowProvider>
      <ReactFlow
        key={key}
        nodes={map.nodes}
        edges={map.edges}
        defaultEdgeOptions={{ type: 'bezier' }}
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 0.7 }}
        minZoom={0.02}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      />
    </ReactFlowProvider>
  );
}
