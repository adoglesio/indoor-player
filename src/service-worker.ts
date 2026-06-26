// src/service-worker.ts
/// <reference lib="webworker" />
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = 'indoor-media-v1';

// Intercepta requisições para baixar mídia
sw.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Se for uma requisição de vídeo/imagem do S3, cacheia
  if (url.hostname.includes('s3.amazonaws.com') || url.hostname.includes('cloudfront.net')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse; // Retorna do cache (offline)
        }
        // Baixa e guarda no cache
        const response = await fetch(event.request);
        cache.put(event.request, response.clone());
        return response;
      })
    );
  }
});

// Ativação: limpa caches antigos
sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});


export {
  
}; 


