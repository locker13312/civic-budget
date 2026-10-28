// TCP-проксі для тестів збою БД: тест БД (AC-2.4) і E2E (AC-3.10)
import net from 'node:net';

/**
 * TCP-проксі між застосунком і PostgreSQL: зупинка проксі імітує падіння БД.
 *
 * @param {number} targetPort
 */
export async function startProxy(targetPort) {
  /** @type {Set<net.Socket>} */
  const sockets = new Set();
  /** @type {net.Server} */
  let server;
  let port = 0;

  const listen = () =>
    new Promise((resolve) => {
      server = net.createServer((client) => {
        const upstream = net.connect(targetPort, '127.0.0.1');
        for (const socket of [client, upstream]) {
          sockets.add(socket);
          socket.on('close', () => sockets.delete(socket));
          socket.on('error', () => socket.destroy());
        }
        client.pipe(upstream).pipe(client);
      });
      server.listen(port, '127.0.0.1', () => {
        port = /** @type {net.AddressInfo} */ (server.address()).port;
        resolve(port);
      });
    });

  await listen();
  return {
    port: () => port,
    stop: () =>
      new Promise((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => resolve(undefined));
      }),
    start: listen,
  };
}
