// Subidas multipart con archivos locales ({ uri, type, name }).
// Desde Expo 57 el `fetch` global es el de Expo, que no admite partes con `uri`
// ("Unsupported FormDataPart implementation"). XMLHttpRequest sigue siendo el de
// React Native y sí las admite. Devuelve un objeto parecido a Response de fetch.
export function uploadForm(url, { method = 'POST', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.entries(headers || {}).forEach(([key, value]) => {
      if (value != null && key.toLowerCase() !== 'content-type') xhr.setRequestHeader(key, String(value));
    });
    xhr.timeout = 60000;
    xhr.onload = () => {
      const text = xhr.responseText || '';
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        text: async () => text,
        json: async () => JSON.parse(text),
      });
    };
    xhr.onerror = () => reject(new Error('Error de red al subir la imagen'));
    xhr.ontimeout = () => reject(new Error('La subida tardó demasiado. Inténtalo de nuevo.'));
    xhr.send(body);
  });
}
