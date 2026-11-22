// fetch con límite de tiempo: si el servidor no contesta en `ms`, se corta
// (sin esto, iOS espera hasta 60 segundos antes de dar error).
async function fetchConTiempo(url, opciones = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opciones, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new Error('El servidor tardó demasiado en responder.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchConTiempo };
