export interface MemoryUpdatePayload {
    type: 'memory_update';
    timestamp: number;
    memoryMb: number;
    isRunning?: boolean;
    sampleRate?: number;
}

// You can add more types here later if the frontend needs to send messages BACK to the extension
export type ExtensionMessage = MemoryUpdatePayload;