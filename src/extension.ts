import * as vscode from 'vscode';
import * as fs from 'fs';
import { MemoryTracker } from './extension/memoryTracker';
import { ExtensionMessage } from './shared/types';

export function activate(context: vscode.ExtensionContext) {
    const memoryTracker = new MemoryTracker(context);
    let currentPanel: vscode.WebviewPanel | undefined = undefined;
    
    const startGraphCommand = vscode.commands.registerCommand('cpp-mem-graph.showGraph', () => {
        if (currentPanel) {
            currentPanel.reveal(currentPanel.viewColumn ?? vscode.ViewColumn.Beside, true);
            return;
        }

        currentPanel = vscode.window.createWebviewPanel(
            'cppMemGraph',
            'C/C++ Memory Graph',
            { 
                viewColumn: vscode.ViewColumn.Beside, 
                preserveFocus: true 
            },
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'src', 'webview')
                ]
            }
        );

        const savedRate = context.globalState.get<number>('cppMemGraph.sampleRate', 1000);
        let autoCloseEnabled = context.globalState.get<boolean>('cppMemGraph.autoClose', false);

        memoryTracker.setUpdateInterval(savedRate);

        currentPanel.webview.html = getWebviewContent(currentPanel, context, savedRate, autoCloseEnabled);

        currentPanel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'set_update_interval') {
                memoryTracker.setUpdateInterval(message.ms);
                await context.globalState.update('cppMemGraph.sampleRate', message.ms);
            } else if (message.type === 'set_auto_close') {
                autoCloseEnabled = message.value;
                await context.globalState.update('cppMemGraph.autoClose', message.value);
            }
        });

        const memoryListener = memoryTracker.ondidUpdateMemory((payload: ExtensionMessage) => {
            if (currentPanel) {
                currentPanel.webview.postMessage(payload);

                if (!payload.isRunning && autoCloseEnabled) {
                    currentPanel.dispose();
                }
            }
        });

        currentPanel.onDidDispose(() => {
            currentPanel = undefined;
            memoryListener.dispose();
        }, null, context.subscriptions);
    });

    context.subscriptions.push(startGraphCommand);

    context.subscriptions.push(
        vscode.debug.onDidStartDebugSession((session) => {
            // Include 'cppvsdbg' for MSVC on Windows
            if (session.type === 'cppdbg' || session.type === 'lldb-dap' || session.type === 'cppvsdbg') {
                vscode.commands.executeCommand('cpp-mem-graph.showGraph');
            }
        })
    );
}

function getWebviewContent(panel: vscode.WebviewPanel,
                           context: vscode.ExtensionContext,
                           initialRate: number,
                           initialAutoClose: boolean) : string {
    const getWebviewUri = (fileName: string) => {
        const diskPath = vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', fileName);
        return panel.webview.asWebviewUri(diskPath);
    };

    const chartJsUri = getWebviewUri('chart.umd.min.js');
    const mainJsUri = getWebviewUri('main.js');

    // Cross-platform Uri loading
    const htmlUri = vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', 'index.html');
    let htmlContent = fs.readFileSync(htmlUri.fsPath, 'utf8');

    htmlContent = htmlContent
        .replace(/{{CSP_SOURCE}}/g, panel.webview.cspSource)
        .replace('{{CHART_JS_URI}}', chartJsUri.toString())
        .replace('{{MAIN_JS_URI}}', mainJsUri.toString())
        .replace('{{INITIAL_RATE}}', initialRate.toString())
        .replace('{{INITIAL_AUTO_CLOSE}}', initialAutoClose.toString());

    return htmlContent;
}

export function deactivate() {
    import('pidusage').then(pidusage => pidusage.clear());
}