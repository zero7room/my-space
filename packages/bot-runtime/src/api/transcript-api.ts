import type { IngressServer } from "../ingress/http-server.js";
import type { TranscriptRepo } from "../repositories/transcript-repo.js";

export type TranscriptApiOptions = {
  transcript: TranscriptRepo;
  adminToken: string;
};

export function mountTranscriptApi(server: IngressServer, opts: TranscriptApiOptions): void {
  server.route("GET", "/api/threads/:id/transcript", async (req) => {
    const v = req.headers["x-admin-token"];
    if ((Array.isArray(v) ? v[0] : v) !== opts.adminToken) return { status: 401 };
    const threadId = req.params.id ?? "";
    const lines = await opts.transcript.read(threadId);
    return { status: 200, body: lines };
  });
}
