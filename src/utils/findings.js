// Busca el fundamento (analysis.findings) que corresponde a un nodo del mapa.
// Los mapas nuevos guardan en metadata.finding_id el id exacto. En los anteriores se busca por
// número de fundamento, que puede repetirse (antecedentes, puntos del fallo o varias sentencias):
// se prefiere el seleccionado para el mapa y del documento indicado en el nodo.
export function findFinding(findings, nodeId, metadata = {}) {
  const list = findings || [];
  if (metadata.finding_id) {
    const exact = list.find((f) => f.id === metadata.finding_id);
    if (exact) return exact;
  }
  const candidates = list.filter(
    (f) => f.node_id === nodeId || (metadata.fundamento_num && f.fundamento_num === metadata.fundamento_num)
  );
  const sameDoc = (f) => metadata.document_id && f.document_id === metadata.document_id;
  return candidates.find((f) => sameDoc(f) && f.is_selected)
    || candidates.find(sameDoc)
    || candidates.find((f) => f.is_selected)
    || candidates[0];
}
