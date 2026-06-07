import { WebSocketServer } from 'ws';

let wss = null;
const clients = new Map();

export function initReplaySocket(server) {
  if (wss) {
    console.log('WebSocket server already initialized');
    return wss;
  }
  
  wss = new WebSocketServer({ server, path: '/ws/replay' });
  
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
        handleClientMessage(clientId, data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
        }));
      }
    });
    
    ws.on('close', () => {
      console.log(`WebSocket client disconnected: ${clientId}`);
      clients.delete(clientId);
    });
    
    ws.on('error', (error) => {
      console.error(`WebSocket client error ${clientId}:`, error);
      clients.delete(clientId);
    });
    
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      message: 'Connected to replay progress server',
    }));
  });
  
  console.log('WebSocket server initialized for replay progress');
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
  if (wss) {
    wss.close();
    wss = null;
    clients.clear();
    console.log('WebSocket server closed');
  }
}

export default {
  initReplaySocket,
  broadcastReplayProgress,
  broadcastToAll,
  getConnectedClients,
  closeReplaySocket,
};
