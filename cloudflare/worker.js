// Cloudflare Workers host for the world server.
//
// PartyKit's hosted platform shut down (Oct 2026), so the same game server
// now runs as a Durable Object on Bernie's own Cloudflare account. This file
// is a thin adapter: it gives party/server.js the small slice of the PartyKit
// "room" API it uses (storage, env, broadcast, getConnections, conn.send/
// close/id), so server.js itself stays unchanged and still runs under
// `npx partykit dev` for local work.
//
// URL shape is kept identical to PartyKit — /parties/main/<room>[/register…]
// — so the client only needs a new host name.

import WorldServer from '../party/server.js';

export class World {
  constructor(ctx, env){
    this.ctx = ctx;
    this.env = env;
    this.conns = new Map();   // id -> conn wrapper
    const self = this;
    this.room = {
      id: 'global',
      env,
      storage: ctx.storage,
      broadcast(msg, except){
        const skip = new Set(except || []);
        for (const c of self.conns.values()){
          if (skip.has(c.id)) continue;
          try { c.send(msg); } catch(e){}
        }
      },
      getConnections(){ return self.conns.values(); },
    };
    this.server = new WorldServer(this.room);
  }

  async fetch(req){
    if (req.headers.get('Upgrade') !== 'websocket'){
      return this.server.onRequest(req);
    }
    const pair = new WebSocketPair();
    const client = pair[0], ws = pair[1];
    ws.accept();
    const conn = {
      id: crypto.randomUUID(),
      send: m => ws.send(m),
      close: () => { try { ws.close(1000, 'bye'); } catch(e){} },
    };
    this.conns.set(conn.id, conn);
    let closed = false;
    const done = () => {
      if (closed) return;
      closed = true;
      this.conns.delete(conn.id);
      try { this.server.onClose(conn); } catch(e){ console.error(e); }
    };
    ws.addEventListener('message', ev => {
      Promise.resolve(this.server.onMessage(ev.data, conn)).catch(e => console.error(e));
    });
    ws.addEventListener('close', done);
    ws.addEventListener('error', ev => {
      try { this.server.onError && this.server.onError(conn, ev); } catch(e){}
      done();
    });
    Promise.resolve(this.server.onConnect(conn)).catch(e => console.error(e));
    return new Response(null, { status: 101, webSocket: client });
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    // /parties/main/<room>[/...]
    const m = url.pathname.match(/^\/parties\/main\/([^/]+)/);
    if (!m){
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      return new Response('Escape Tsunami server', { status: 200, headers: CORS });
    }
    const stub = env.WORLD.get(env.WORLD.idFromName(decodeURIComponent(m[1])));
    return stub.fetch(req);
  },
};
