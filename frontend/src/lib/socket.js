import { io } from 'socket.io-client';
const URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
let socket;
export function getSocket() {
  if (!socket) socket = io(URL, { transports: ['websocket', 'polling'], autoConnect: true });
  return socket;
}
