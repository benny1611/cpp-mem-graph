export interface MemoryUpdatePayload {
    type: 'memory_update';
    timestamp: number;
    memoryMb: number;
    isRunning?: boolean;
    isPaused?: boolean;
    isStateChange?: boolean;
    sampleRate?: number;
}

// You can add more types here later if the frontend needs to send messages BACK to the extension
export type ExtensionMessage = MemoryUpdatePayload;

// Data flowing Webview -> Extension
export type WebviewMessage = 
    | { type: 'set_update_interval'; ms: number }
    | { type: 'set_auto_close'; value: boolean };