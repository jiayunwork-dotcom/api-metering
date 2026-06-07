import { WebSocketServer } from 'ws';
import { URL } from 'url';

let wss = null;
let serverInstance = null;
const clients = new Map();

function handleUpgrade(request, socket, head) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;
    
    console.log('WebSocket upgrade request for path:', pathname);
    
    if (pathname !== '/ws/replay') {
      console.log('Path mismatch, ignoring upgrade request for:', pathname);
      return;
    }
    
    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log('WebSocket upgrade completed, emitting connection');
      wss.emit('connection', ws, request);
    });
  } catch (error) {
    console.error('WebSocket upgrade error:', error);
    if (!socket.destroyed) {
      try {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      } catch (e) {
        console.error('Error writing error response:', e);
      }
      socket.destroy();
    }
  }
}

export function initReplaySocket(server) {
  if (wss) {
    console.log('WebSocket server already initialized');
    return wss;
  }
  
  serverInstance = server;
  
  wss = new WebSocketServer({ noServer: true, clientTracking: false });
  
  const listeners = server.listeners('upgrade');
  console.log(`Existing upgrade listeners: ${listeners.length}`);
  
  if (listeners.length > 0) {
    server.removeAllListeners('upgrade');
    console.log('Removed existing upgrade listeners');
  }
  
  server.on('upgrade', handleUpgrade);
  console.log('Added WebSocket upgrade handler to server');
  
  wss.on('connection', (ws, request) => {
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`New WebSocket client connected: ${clientId}`);
    
    clients.set(clientId, {
      ws,
      subscribedJobs: new Set(),
    });
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log(`Received message from ${clientId}:`, data.type);
        handleClientMessage(clientId, data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
          }));
        }
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log(`WebSocket client disconnected: ${clientId}, code: ${code}, reason: ${reason}`);
      clients.delete(clientId);
    });
    
    ws.on('error', (error) => {
      console.error(`WebSocket client error ${clientId}:`, error);
      clients.delete(clientId);
    });
    
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        message: 'Connected to replay progress server',
      }));
      console.log(`Sent welcome message to ${clientId}`);
    }
  });
  
  console.log('WebSocket server initialized for replay progress on /ws/replay');
  return wss;
}

function handleClientMessage(clientId, data) {
  const client = clients.get(clientId);
  if (!client) return;
  
  const { type, jobId } = data;
  
  switch (type) {
    case 'subscribe':
      if (jobId) {
        client.subscribedJobs.add(jobId);
        client.ws.send(JSON.stringify({
          type: 'subscribed',
          jobId,
          message: `Subscribed to progress updates for job ${jobId}`,
        }));
      }
      break;
      
    case 'unsubscribe':
      if (jobId) {
        client.subscribedJobs.delete(jobId);
        client.ws.send(JSON.stringify({
          type: 'unsubscribed',
          jobId,
          message: `Unsubscribed from progress updates for job ${jobId}`,
        }));
      }
      break;
      
    default:
      client.ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${type}`,
      }));
  }
}

export function broadcastReplayProgress(jobId, progressData) {
  if (!wss) return;
  
  const message = JSON.stringify({
    type: 'progress',
    jobId,
    timestamp: new Date().toISOString(),
    data: progressData,
  });
  
  for (const [clientId, client] of clients.entries()) {
    if (client.subscribedJobs.has(jobId) || client.subscribedJobs.size === 0) {
      if (client.ws.readyState === 1) {
        client.ws.send(message);
      }
    }
  }
  
  if (progressData.completed) {
    const completedMessage = JSON.stringify({
      type: 'completed',
      jobId,
      timestamp: new Date().toISOString(),
      data: progressData,
    });
    
    for (const [clientId, client] of clients.entries()) {
      if (client.subscribedJobs.has(jobId)) {
        client.subscribedJobs.delete(jobId);
      }
    }
  }
}

export function broadcastToAll(message) {
  if (!wss) return;
  
  const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
  
  for (const [clientId, client] of clients.entries()) {
    if (client.ws.readyState === 1) {
      client.ws.send(messageStr);
    }
  }
}

export function getConnectedClients() {
  return {
    count: clients.size,
    clientIds: Array.from(clients.keys()),
  };
}

export function closeReplaySocket() {
  if (serverInstance) {
    serverInstance.removeListener('upgrade', handleUpgrade);
    serverInstance = null;
  }
  if (wss) {
    wss.close();
    wss = null;
  }
  clients.clear();
  console.log('WebSocket server closed');
}

export default {
  initReplaySocket,
  broadcastReplayProgress,
  broadcastToAll,
  getConnectedClients,
  closeReplaySocket,
};
