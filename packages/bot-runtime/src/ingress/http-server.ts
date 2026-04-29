import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";

export type IngressRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
  params: Record<string, string>;
};

export type IngressResponseBody = {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
};

export type IngressResponseStream = {
  status: number;
  headers?: Record<string, string>;
  stream: (
    write: (chunk: string | Buffer) => void,
    end: () => void,
    abortSignal: AbortSignal,
  ) => Promise<void>;
};

export type IngressResponse = IngressResponseBody | IngressResponseStream;

export type IngressHandler = (req: IngressRequest) => Promise<IngressResponse>;

export type IngressServer = {
  route(method: string, path: string, handler: IngressHandler): void;
  listen(port: number): Promise<{ port: number }>;
  close(): Promise<void>;
};

type Route = {
  method: string;
  segments: string[];
  hasParams: boolean;
  handler: IngressHandler;
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

function compile(p: string): { segments: string[]; hasParams: boolean } {
  const segments = p.split("/").filter((s) => s.length > 0);
  return { segments, hasParams: segments.some((s) => s.startsWith(":")) };
}

export function createIngressServer(): IngressServer {
  const routes: Route[] = [];

  function match(
    method: string,
    pathname: string,
  ): { handler: IngressHandler; params: Record<string, string> } | null {
    const reqSegs = pathname.split("/").filter((s) => s.length > 0);
    // Exact first
    for (const r of routes) {
      if (r.hasParams) continue;
      if (r.method.toUpperCase() !== method.toUpperCase()) continue;
      if (r.segments.length !== reqSegs.length) continue;
      if (r.segments.every((s, i) => s === reqSegs[i])) return { handler: r.handler, params: {} };
    }
    // Param next
    for (const r of routes) {
      if (!r.hasParams) continue;
      if (r.method.toUpperCase() !== method.toUpperCase()) continue;
      if (r.segments.length !== reqSegs.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < r.segments.length; i++) {
        const seg = r.segments[i] ?? "";
        const got = reqSegs[i] ?? "";
        if (seg.startsWith(":")) params[seg.slice(1)] = got;
        else if (seg !== got) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }

  const httpServer: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const pathname = req.url?.split("?")[0] ?? "";
      const matched = match(req.method ?? "GET", pathname);
      if (!matched) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      const rawBody = await readBody(req);
      const result = await matched.handler({
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: req.headers as Record<string, string | string[] | undefined>,
        rawBody,
        params: matched.params,
      });
      res.statusCode = result.status;
      for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v);
      if ("stream" in result) {
        const abortController = new AbortController();
        const abort = () => abortController.abort();
        req.on("close", abort);
        res.on("close", abort);
        await result.stream(
          (chunk) => res.write(chunk),
          () => res.end(),
          abortController.signal,
        );
      } else if (result.body !== undefined) {
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
      const compiled = compile(path);
      routes.push({ method, ...compiled, handler });
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
