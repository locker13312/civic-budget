// найпростіший балансувальник для тесту blue-green (AC-4.7): HTTP-проксі,
// що шле кожен запит на поточну версію; switchTo перемикає нові запити
import http from 'node:http';

/**
 * @param {string} target базова адреса, напр. http://127.0.0.1:3000
 */
export async function startBalancer(target) {
  let current = new URL(target);
  const server = http.createServer((request, response) => {
    const upstream = http.request(
      {
        host: current.hostname,
        port: current.port,
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (reply) => {
        response.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(response);
      },
    );
    upstream.on('error', () => {
      response.writeHead(502).end();
    });
    request.pipe(upstream);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    base: `http://127.0.0.1:${port}`,
    /** @param {string} next */
    switchTo: (next) => {
      current = new URL(next);
    },
    /** @returns {Promise<void>} */
    stop: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
