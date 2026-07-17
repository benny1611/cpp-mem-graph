import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MemoryTracker } from './extension/memoryTracker';
import { ExtensionMessage } from './shared/types';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const memoryTracker = new MemoryTracker(context);

	let currentPanel: vscode.WebviewPanel | undefined = undefined;
	
	// Command to open the memory graph
	const startGraphCommand = vscode.commands.registerCommand('cpp-mem-graph.showGraph', () => {
        
        // If we already have a panel, reveal it in its EXISTING column, 
        // and set preserveFocus to true so it doesn't steal focus from your code.
        if (currentPanel) {
            currentPanel.reveal(currentPanel.viewColumn ?? vscode.ViewColumn.Beside, true);
            return;
        }

        // Otherwise, create a new panel
        currentPanel = vscode.window.createWebviewPanel(
            'cppMemGraph',
            'C/C++ Memory Graph',
            { 
                viewColumn: vscode.ViewColumn.Beside, 
                preserveFocus: true // Don't steal focus on first launch either
            },
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'src', 'webview')
                ]
            }
        );

			// Get the saved values from VS Code, or use defaults (1000ms and false) if they don't exist yet
			const savedRate = context.globalState.get<number>('cppMemGraph.sampleRate', 1000);
			let autoCloseEnabled = context.globalState.get<boolean>('cppMemGraph.autoClose', false);

			memoryTracker.setUpdateInterval(savedRate);

			//Load the HTML content
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

			// The bridge: Listen to the MemoryTracker and post messages to the Webview
			const memoryListener = memoryTracker.ondidUpdateMemory((payload: ExtensionMessage) => {
				if (currentPanel) {
					currentPanel.webview.postMessage(payload);

					if (!payload.isRunning && autoCloseEnabled) {
						currentPanel.dispose();
					}
				}
			});

			// Clean up when the user closes the panel
			currentPanel.onDidDispose(() => {
				currentPanel = undefined;
				memoryListener.dispose(); // stop listening to avoi memory leaks
			}, null, context.subscriptions);
	});

	context.subscriptions.push(startGraphCommand);

	// Auto-open the graph on debug start
    context.subscriptions.push(
        vscode.debug.onDidStartDebugSession((session) => {
            // Only pop open the graph if we are debugging C/C++
            if (session.type === 'cppdbg' || session.type === 'lldb-dap') {
                //console.log(`[Extension] Started ${session.type} debug session. Opening graph...`);
                // Programmatically trigger the command we just registered above
                vscode.commands.executeCommand('cpp-mem-graph.showGraph');
            }
        })
    );
}


// Temporary placeholder
function getWebviewContent(panel: vscode.WebviewPanel,
						   context: vscode.ExtensionContext,
						   initialRate: number,
						   initialAutoClose: boolean) : string {
	// Helper function to resolve paths directly to webview-ready local URIs
    const getWebviewUri = (fileName: string) => {
        const diskPath = vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', fileName);
        return panel.webview.asWebviewUri(diskPath);
    };
	const chartJsUri = getWebviewUri('chart.umd.min.js');
    const mainJsUri = getWebviewUri('main.js');

	// Load the template layout file from disk
    const htmlFilePath = path.join(context.extensionPath, 'src', 'webview', 'index.html');
    let htmlContent = fs.readFileSync(htmlFilePath, 'utf8');

	// Swap configuration values and security headers into placeholders
    htmlContent = htmlContent
        .replace(/{{CSP_SOURCE}}/g, panel.webview.cspSource)
        .replace('{{CHART_JS_URI}}', chartJsUri.toString())
        .replace('{{MAIN_JS_URI}}', mainJsUri.toString())
        .replace('{{INITIAL_RATE}}', initialRate.toString())
        .replace('{{INITIAL_AUTO_CLOSE}}', initialAutoClose.toString());

	return htmlContent;
}

// This method is called when your extension is deactivated
export function deactivate() {
	import('pidusage').then(pidusage => pidusage.clear());
}
