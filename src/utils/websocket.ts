/**
 * WebSocket utilities for real-time state management
 */

export type MessageType =
  | "store:sync"
  | "store:update"
  | "forum:sync"
  | "forum:update"
  | "user:join"
  | "user:leave";

export interface WebSocketMessage {
  type: MessageType;
  user_id?: string;
  payload: unknown;
}

export class WebSocketManager {
  private url: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("WebSocket connected");
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onerror = () => {
          reject(new Error("WebSocket connection failed"));
        };

        this.ws.onclose = () => {
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      );
      setTimeout(() => {
        this.connect().catch(() => {
          // Silently handle reconnection failures
        });
      }, this.reconnectDelay);
    }
  }

  send(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket not connected");
    }
  }

  on(type: MessageType, callback: (payload: unknown) => void): () => void {
    const handler = (event: Event) => {
      const messageEvent = event as unknown as { data: string };
      try {
        const message = JSON.parse(messageEvent.data);
        if (message.type === type) {
          callback(message.payload);
        }
      } catch (error) {
        console.error("Failed to parse message:", error);
      }
    };

    if (this.ws) {
      this.ws.addEventListener("message", handler as EventListener);
    }

    // Return unsubscribe function
    return () => {
      if (this.ws) {
        this.ws.removeEventListener("message", handler as EventListener);
      }
    };
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
