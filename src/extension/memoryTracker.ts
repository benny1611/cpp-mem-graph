import * as vscode from "vscode";
import pidusage = require('pidusage');
import { MemoryUpdatePayload } from "../shared/types";

export class MemoryTracker implements vscode.DebugAdapterTrackerFactory {

    private activeSessions: Map<string, {intervalId: NodeJS.Timeout | undefined, pid: number}> = new Map();
    private currentIntervalMs: number = 1000;

    private _onDidUpdateMemory = new vscode.EventEmitter<MemoryUpdatePayload>();
    public readonly ondidUpdateMemory = this._onDidUpdateMemory.event;

    constructor(private context: vscode.ExtensionContext) {
        this.registerListeners();
    }

    public setUpdateInterval(ms: number) {
        this.currentIntervalMs = ms;
        for (const [sessionId, data] of this.activeSessions.entries()) {
            if (data.intervalId) {
                clearInterval(data.intervalId);
                this.startTrackingInterval(sessionId, data.pid);
            }
        }
    }

    private registerListeners() {
        // Register tracker factories for GDB/LLDB as well as Visual Studio Windows Debugger (cppvsdbg)
        const debugTypes = ['cppdbg', 'lldb-dap', 'cppvsdbg'];
        
        for (const type of debugTypes) {
            this.context.subscriptions.push(
                vscode.debug.registerDebugAdapterTrackerFactory(type, this)
            );
        }

        this.context.subscriptions.push(
            vscode.debug.onDidTerminateDebugSession(session => {
                this.stopTracking(session.id);
            })
        );
    }

    public createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        return {
            onDidSendMessage: (message: any) => {
                if (message.type === 'event') {
                    if (message.event === 'process' && message.body?.systemProcessId) {
                        const pid = message.body.systemProcessId;
                        this.startTracking(session.id, pid);
                    } else if (message.event === 'stopped') {
                        this.pauseTracking(session.id);
                    } else if (message.event === 'continued') {
                        this.resumeTracking(session.id);
                    }
                }
            }
        };
    }

    private startTracking(sessionId: string, pid: number) {
        if (this.activeSessions.has(sessionId)) {
            return;
        }
        
        this.activeSessions.set(sessionId, {intervalId: undefined, pid});
        this.startTrackingInterval(sessionId, pid);
    }

    private startTrackingInterval(sessionId: string, pid: number) {
        const data = this.activeSessions.get(sessionId);
        if (!data) {
            return;
        }
        
        if (data.intervalId) {
            clearInterval(data.intervalId);
        }

        let consecutiveErrors = 0;

        data.intervalId = setInterval(async () => {
            try {
                const stats = await pidusage(pid);
                consecutiveErrors = 0; // Reset error count on success

                const memoryMB = stats.memory / 1024 / 1024;

                this._onDidUpdateMemory.fire({
                    type: 'memory_update',
                    timestamp: Date.now(),
                    memoryMb: memoryMB,
                    isRunning: true,
                    isPaused: false
                });

            } catch (error) {
                console.error(`[MemoryTracker] Warning: Failed to query stats for PID ${pid}:`, error);
                consecutiveErrors++;

                // Only stop tracking if it fails 5 times in a row (e.g. process actually died)
                if (consecutiveErrors > 5) {
                    this.stopTracking(sessionId);
                }
            }
        }, this.currentIntervalMs);
    }

    private pauseTracking(sessionId: string) {
        const data = this.activeSessions.get(sessionId);
        if (data && data.intervalId) {
            clearInterval(data.intervalId);
            data.intervalId = undefined;
            
            this._onDidUpdateMemory.fire({
                type: 'memory_update', timestamp: Date.now(), memoryMb: 0, 
                isRunning: true, isPaused: true, isStateChange: true
            });
        }
    }

    private resumeTracking(sessionId: string) {
        const data = this.activeSessions.get(sessionId);
        if (data && !data.intervalId) {
            this.startTrackingInterval(sessionId, data.pid);
            
            this._onDidUpdateMemory.fire({
                type: 'memory_update', timestamp: Date.now(), memoryMb: 0, 
                isRunning: true, isPaused: false, isStateChange: true
            });
        }
    }

    private stopTracking(sessionId: string) {
        const sessionData = this.activeSessions.get(sessionId);
        if (sessionData) {
            if (sessionData.intervalId) {
                clearInterval(sessionData.intervalId);
            }
            this.activeSessions.delete(sessionId);
            pidusage.clear(); 

            this._onDidUpdateMemory.fire({
                type: 'memory_update', timestamp: Date.now(), memoryMb: 0, 
                isRunning: false, isStateChange: true
            });
        }
    }
}