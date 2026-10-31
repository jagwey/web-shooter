export const CHANNEL_NAME = "jagwey-web-shooter";

export function createBridge() {
  const channel = new BroadcastChannel(CHANNEL_NAME);

  return {
    post(message) {
      channel.postMessage(message);
    },
    listen(handler) {
      channel.onmessage = (event) => {
        handler(event.data);
      };
    },
    close() {
      channel.close();
    },
  };
}
