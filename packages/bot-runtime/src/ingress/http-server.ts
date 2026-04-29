import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";

export type IngressRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
};

export type IngressResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
};

export type IngressHandler = (req: IngressRequest) => Promise<IngressResponse>;

export type IngressServer = {
  route(method: string, path: string, handler: IngressHandler): void;
  listen(port: number): Promise<{ port: number }>;
  close(): Promise<void>;
};

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer | string) => {
      chunks.push(typeof c === "string" ? Buffer.from(c) : c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function createIngressServer(): IngressServer {
  const routes = new Map<string, IngressHandler>();
  const key = (m: string, p: string) => `${m.toUpperCase()} ${p}`;

  const httpServer: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const handler = routes.get(key(req.method ?? "GET", req.url?.split("?")[0] ?? ""));
      if (!handler) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      const rawBody = await readBody(req);
      const result = await handler({
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: req.headers as Record<string, string | string[] | undefined>,
        rawBody,
      });
      res.statusCode = result.status;
      for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v);
      if (result.body !== undefined) {
        if (typeof result.body === "string" || Buffer.isBuffer(result.body)) {
          res.end(result.body);
        } else {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(result.body));
        }
      } else {
        res.end();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.statusCode = 500;
      res.end(message);
    }
  });

  return {
    route(method, path, handler) {
      routes.set(key(method, path), handler);
    },
    listen(port) {
      return new Promise((resolve) => {
        httpServer.listen(port, "127.0.0.1", () => {
          const addr = httpServer.address() as AddressInfo;
          resolve({ port: addr.port });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        httpServer.close((e) => (e ? reject(e) : resolve()));
      });
    },
  };
}
