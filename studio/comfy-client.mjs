// Server-side adapter for an existing local ComfyUI instance.
// https://docs.comfy.org/development/comfyui-server/comms_routes
// Only pass workflows selected from a trusted local registry, never from a browser request.
const origin = "http://127.0.0.1:8188";
const validId = /^[a-zA-Z0-9_-]{1,128}$/;

export function createComfyClient(request = fetch, timeout = () => AbortSignal.timeout(15000)) {
  async function send(path, options = {}) {
    const response = await request(origin + path, {...options, redirect:"error", signal:timeout()});
    if (!response.ok) throw new Error("ComfyUI request failed (" + response.status + ").");
    return response;
  }

  return Object.freeze({
    async health() {
      await send("/system_stats");
      return true;
    },
    async queue(graph, clientId) {
      if (!graph || Array.isArray(graph) || typeof graph !== "object" || !Object.keys(graph).length) {
        throw new Error("A configured API workflow is required.");
      }
      if (typeof clientId !== "string" || !validId.test(clientId)) throw new Error("Invalid client id.");
      const result = await (await send("/prompt", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({prompt: graph, client_id: clientId})
      })).json();
      if (typeof result.prompt_id !== "string" || !validId.test(result.prompt_id)) {
        throw new Error("ComfyUI did not return a job id.");
      }
      return result.prompt_id;
    },
    async history(id) {
      if (typeof id !== "string" || !validId.test(id)) throw new Error("Invalid job id.");
      const result = await (await send("/history/" + id)).json();
      return Object.hasOwn(result, id) ? result[id] : null;
    }
  });
}
