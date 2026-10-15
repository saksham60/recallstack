// Loopback-only fixture for browser tests of real conversation persistence.
// Production code never imports this script or selects this endpoint.
import { createServer } from "node:http";
const server = createServer(async (request, response) => {
  if (request.url === "/health") { response.writeHead(200).end("ready"); return; }
  if (request.method !== "POST" || request.url !== "/v1/chat/completions" || request.headers.authorization !== "Bearer e2e-placeholder") { response.writeHead(404).end(); return; }
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 524288) { response.writeHead(413).end(); return; }
  }
  response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Test provider response for conversation persistence." }, finish_reason: null }] })}\n\n`);
  response.end(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
});
server.listen(4159, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
