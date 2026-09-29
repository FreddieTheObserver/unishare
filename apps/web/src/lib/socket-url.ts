/**
 * Where socket.io connects. Deployed, that's the page's own origin: the ingress sends
 * /socket.io on the web host to the API, so the host-only session cookie goes along.
 * Locally the API listens on its own port.
 */
export const socketURL =
  process.env.NEXT_PUBLIC_SOCKET_URL ??
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001')
