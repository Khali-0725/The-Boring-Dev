/* Backend call — POST the conversation to our serverless function and
   stream the reply back token-by-token. DOM-free: reports via callbacks. */

export function streamReply(messages, cb) {
  return fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: messages }),
  })
    .then(async function (r) {
      // error path: server responds with JSON, not a stream
      if (!r.ok || !r.body) {
        let why = "Unknown error.";
        try {
          const data = await r.json();
          why = (data && (data.error || data.detail)) || why;
        } catch (e) {}
        cb.onError(why);
        return;
      }
      // success: read the plain-text stream and grow the bubble live
      cb.onOpen();
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        full += decoder.decode(chunk.value, { stream: true });
        cb.onToken(full);
      }
      cb.onDone(full);
    })
    .catch(function () { cb.onNetworkError(); });
}
