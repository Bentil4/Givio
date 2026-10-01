/**
 * Specs must never open a real network socket. A component that subscribes to Appwrite
 * Realtime (e.g. AdminDashboard) would otherwise connect to the live Appwrite endpoint, and
 * because tests run non-isolated the handshake completes during some later spec file, where
 * jsdom's bundled undici throws ERR_INVALID_ARG_TYPE dispatching the 'open' Event — an
 * Unhandled Error that fails the run. This socket never connects, so nothing is ever sent or
 * received; Realtime simply waits on a connection that never opens.
 */
export class InertWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = InertWebSocket.CONNECTING;

  constructor(url: string | URL) {
    super();
    this.url = String(url);
  }

  send(): void {
    return undefined;
  }

  close(): void {
    this.readyState = InertWebSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  }
}

export function replaceWebSocketWithInertFake(): void {
  globalThis.WebSocket = InertWebSocket as unknown as typeof WebSocket;
}
