// Paginación de readRecords separada de la capa nativa para poder probarla en Node.
export async function leerPaginado(reader, recordType, timeRangeFilter, pageSize = 1000) {
  const todos = [];
  let pageToken;
  do {
    const respuesta = await reader(recordType, {
      timeRangeFilter,
      ascendingOrder: true,
      pageSize,
      ...(pageToken ? { pageToken } : {}),
    });
    todos.push(...(respuesta?.records || []));
    pageToken = respuesta?.pageToken || undefined;
  } while (pageToken);
  return todos;
}
