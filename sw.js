/* ══════════════════════════════════════════════════════════════════
   4SIDES · STEELPORT — service worker
   ══════════════════════════════════════════════════════════════════
   O que ele faz, em uma frase: deixa o sistema abrir da tela inicial do
   aparelho e continuar abrindo quando o pátio está sem sinal.

   O que ele NÃO faz, de propósito: guardar versão antiga do sistema.

   Isso é a decisão mais importante deste arquivo. O Steel Port é
   publicado subindo um HTML novo por cima do antigo. Se o service
   worker servisse a cópia guardada primeiro, o operador continuaria
   rodando a versão da semana passada sem saber, e nenhuma correção
   chegaria até ele limpar os dados do navegador. Por isso a página vem
   SEMPRE da rede quando há rede; a cópia guardada só entra quando a
   rede falha.

   Os dados do Supabase nunca passam por aqui. Estoque, descarga e
   faturamento não podem ser respondidos por cópia guardada — melhor o
   sistema dizer que está sem conexão do que mostrar número velho como
   se fosse atual.
*/

const VERSAO = 'steelport-v1';
const CASCA = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icone.svg',
  './icone-mascara.svg'
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(VERSAO)
      .then(c => c.addAll(CASCA).catch(() => {}))   // um arquivo ausente não impede a instalação
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// A página pede para assumir na hora (usado quando o usuário aceita recarregar).
self.addEventListener('message', evento => {
  if (evento.data === 'assumir') self.skipWaiting();
});

self.addEventListener('fetch', evento => {
  const req = evento.request;

  // Só GET. POST, PATCH e DELETE vão direto para a rede, sempre.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nada de outra origem entra no cache: Supabase é dado vivo, e os
  // leitores de OCR e de código de barras vêm de CDN e são grandes
  // demais para guardar sem necessidade.
  if (url.origin !== self.location.origin) return;

  // Páginas: rede primeiro, cópia guardada só se a rede falhar.
  const ehPagina = req.mode === 'navigate' ||
                   (req.headers.get('accept') || '').includes('text/html');

  if (ehPagina) {
    evento.respondWith(
      fetch(req)
        .then(resp => {
          const copia = resp.clone();
          caches.open(VERSAO).then(c => c.put(req, copia)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Ícones e manifesto: cópia guardada primeiro, e atualiza por baixo.
  evento.respondWith(
    caches.match(req).then(guardado => {
      const daRede = fetch(req)
        .then(resp => {
          if (resp && resp.ok) {
            const copia = resp.clone();
            caches.open(VERSAO).then(c => c.put(req, copia)).catch(() => {});
          }
          return resp;
        })
        .catch(() => guardado);
      return guardado || daRede;
    })
  );
});
