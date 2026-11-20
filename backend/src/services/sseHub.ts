import type { ServerResponse } from 'node:http';

class SseHub {
    private clients = new Set<ServerResponse>();
    private heartbeatTimer: NodeJS.Timeout | null = null;

    addClient(res: ServerResponse): void {
        this.clients.add(res);
        if (!this.heartbeatTimer) {
            this.heartbeatTimer = setInterval(() => {
                for (const client of this.clients) {
                    if (client.writableEnded) {
                        this.clients.delete(client);
                    } else {
                        client.write(': heartbeat\n\n');
                    }
                }
            }, 20000);
        }

        res.on('close', () => {
            this.clients.delete(res);
        });
    }

    broadcast(event: string, data: unknown): void {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const client of this.clients) {
            if (client.writableEnded) {
                this.clients.delete(client);
                continue;
            }
            try {
                client.write(payload);
            } catch {
                this.clients.delete(client);
            }
        }
    }

    getClientCount(): number {
        return this.clients.size;
    }
}

export const sseHub = new SseHub();
