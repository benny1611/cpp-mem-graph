import * as vscode from "vscode";
import pidusage = require('pidusage');
import { MemoryUpdatePayload } from "../shared/types";

export class MemoryTracker implements vscode.DebugAdapterTrackerFactory {

    private activeSessions: Map<string, {intervalId: NodeJS.Timeout, pid: number}> = new Map();
    private currentIntervalMs: number = 1000;

    private _onDidUpdateMemory = new vscode.EventEmitter<MemoryUpdatePayload>();
    public readonly ondidUpdateMemory = this._onDidUpdateMemory.event;

    constructor(private context: vscode.ExtensionContext) {
        this.registerListeners();
    }

    public setUpdateInterval(ms: number) {
        this.currentIntervalMs = ms;
        console.log(`[Memory Tracker] Sampling rate updated to ${ms}ms`);

        const sessionsToRestart = Array.from(this.activeSessions.entries());

        for (const [sessionId, data] of sessionsToRestart) {
            // FIX 2: Pass 'true' to let stopTracking know this is just a quick restart
            this.stopTracking(sessionId, true);
            this.startTracking(sessionId, data.pid);
        }
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
        if (this.activeSessions.has(sessionId)) {
            return;
        }

        console.log(`[Memory Tracker] Starting tracking for PID: ${pid}`);

        const intervalId = setInterval(async () => {
            try {
                const stats = await pidusage(pid);
                const memoryMB = stats.memory / 1024 / 1024;

                this._onDidUpdateMemory.fire({
                    type: 'memory_update',
                    timestamp: Date.now(),
                    memoryMb: memoryMB,
                    isRunning: true
                });

                console.log(`[Memory Tracker] Memory used: ${memoryMB}.`);

            } catch (error) {
                // If the C++ program crashes or ends abruptly, pidusage will throw an error.
                console.warn(`[Memory Tracker] Lost track of PID ${pid}. Stopping tracker.`, error);
                this.stopTracking(sessionId);
            }
        }, this.currentIntervalMs);

        this.activeSessions.set(sessionId, {intervalId, pid});
    }

    private stopTracking(sessionId: string, isRestarting: boolean = false) {
        const sessionData = this.activeSessions.get(sessionId);
        if (sessionData) {
            clearInterval(sessionData.intervalId);
            this.activeSessions.delete(sessionId);
            
            // Clear pidusage internal cache to prevent memory leaks in the extension host
            pidusage.clear(); 

            // Only tell the frontend the process stopped if we aren't just restarting the timer
            if (!isRestarting) {
                this._onDidUpdateMemory.fire({
                    type: 'memory_update',
                    timestamp: Date.now(),
                    memoryMb: 0,
                    isRunning: false
                });
            }
            
            console.log(`[Memory Tracker] Stopped tracking session: ${sessionId}`);
        }
    }
}