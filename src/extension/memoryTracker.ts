import * as vscode from "vscode";
import pidusage = require('pidusage');

export class MemoryTracker implements vscode.DebugAdapterTrackerFactory {
    private activeTrackers: Map<string, NodeJS.Timeout> = new Map();

    constructor(private context: vscode.ExtensionContext) {
        this.registerListeners();
    }

    private registerListeners() {
        // 1. Register this class as a Tracker Factory for our specific debuggers
        this.context.subscriptions.push(
            vscode.debug.registerDebugAdapterTrackerFactory('cppdbg', this)
        );
        this.context.subscriptions.push(
            vscode.debug.registerDebugAdapterTrackerFactory('lldb-dap', this)
        );

        // 2. We still use this standard API to clean up when the session ends
        this.context.subscriptions.push(
            vscode.debug.onDidTerminateDebugSession(session => {
                this.stopTracking(session.id);
            })
        );
    }

    // 3. This method is called automatically right before a debug session starts
    public createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        // Return an object that implements the Tracker interface
        return {
            // Intercept messages sent FROM the Debug Adapter TO VS Code
            onDidSendMessage: (message: any) => {
                // Look for the standard DAP 'process' event
                if (message.type === 'event' && message.event === 'process') {
                    console.log(`[Memory Tracker] Intercepted process event!!`, message);
                    
                    if (message.body && message.body.systemProcessId) {
                        const pid = message.body.systemProcessId;
                        this.startTracking(session.id, pid);
                    }
                }
            }
        };
    }

    private startTracking(sessionId: string, pid: number) {
        // Prevent duplicate intervals
        if (this.activeTrackers.has(sessionId)) {
            return;
        }

        console.log(`[Memory Tracker] Starting tracking for PID: ${pid}`);

        const intervalId = setInterval(async () => {
            try {
                const stats = await pidusage(pid);
                const memoryMB = stats.memory / 1024 / 1024;

                // TODO: Dispatch this data to your Webview using postMessage()
                // Example: webviewPanel.webview.postMessage({ type: 'memory_update', value: memoryMB });
                console.log(`[Memory Tracker] PID ${pid} Memory: ${memoryMB.toFixed(2)} MB`);
            } catch (error) {
                // If the C++ program crashes or ends abruptly, pidusage will throw an error.
                console.warn(`[Memory Tracker] Lost track of PID ${pid}. Stopping tracker.`, error);
                this.stopTracking(sessionId);
            }
        }, 1000);

        this.activeTrackers.set(sessionId, intervalId);
    }

    private stopTracking(sessionId: string) {
        const intervalId = this.activeTrackers.get(sessionId);
        if (intervalId) {
            clearInterval(intervalId);
            this.activeTrackers.delete(sessionId);
            
            // Clear pidusage internal cache to prevent memory leaks in the extension host
            pidusage.clear(); 
            
            console.log(`[Memory Tracker] Stopped tracking session: ${sessionId}`);
        }
    }
}