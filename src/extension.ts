import * as vscode from 'vscode';
import { MemoryTracker } from './extension/memoryTracker';
import { ExtensionMessage } from './shared/types';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const memoryTracker = new MemoryTracker(context);

	let currentPanel: vscode.WebviewPanel | undefined = undefined;
	
	// Command to open the memory graph
	const startGraphCommand = vscode.commands.registerCommand('cpp-mem-graph.showGraph', () => {
		const columnToShowIn = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

			// If we already have a panel, show it
			if (currentPanel) {
				currentPanel.reveal(columnToShowIn);
				return;
			}

			// Otherwise, create a new panel
			currentPanel = vscode.window.createWebviewPanel(
				'cppMemGraph',
				'C/C++ Memory Graph',
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
				}
			);

			// Get the saved values from VS Code, or use defaults (1000ms and false) if they don't exist yet
			const savedRate = context.globalState.get<number>('cppMemGraph.sampleRate', 1000);
			let autoCloseEnabled = context.globalState.get<boolean>('cppMemGraph.autoClose', false);

			memoryTracker.setUpdateInterval(savedRate);

			//Load the HTML content
			currentPanel.webview.html = getWebviewContent(savedRate, autoCloseEnabled);

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
                console.log(`[Extension] Started ${session.type} debug session. Opening graph...`);
                // Programmatically trigger the command we just registered above
                vscode.commands.executeCommand('cpp-mem-graph.showGraph');
            }
        })
    );
}


// Temporary placeholder
function getWebviewContent(initialRate: number, initialAutoClose: boolean) {
    return `<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>Memory Graph</title>
					<style>
						body { font-family: var(--vscode-font-family); padding: 10px; }
						.controls { margin-bottom: 20px; padding: 10px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px;}
					</style>
				</head>
				<body>
					<div class="controls">
						<label>
							Sampling Rate:
							<select id="sampleRate">
								<option value="100" ${initialRate === 100 ? 'selected' : ''}>100 ms (Fast)</option>
								<option value="500" ${initialRate === 500 ? 'selected' : ''}>500 ms (Normal)</option>
								<option value="1000" ${initialRate === 1000 ? 'selected' : ''}>1000 ms (Slow)</option>
							</select>
						</label>
						&nbsp;&nbsp;|&nbsp;&nbsp;
						<label>
							<input type="checkbox" id="autoClose" ${initialAutoClose ? 'checked' : ''}> Close graph when debug ends
						</label>
					</div>

					<h1 id="memoryLabel">Waiting for C++ Debug Session...</h1>

					<script>
						const vscode = acquireVsCodeApi();

						document.getElementById('sampleRate').addEventListener('change', (e) => {
							const ms = parseInt(e.target.value, 10);
							vscode.postMessage({ type: 'set_update_interval', ms: ms });
						});

						document.getElementById('autoClose').addEventListener('change', (e) => {
							vscode.postMessage({ type: 'set_auto_close', value: e.target.checked });
						});

						window.addEventListener('message', event => {
							const message = event.data; 
							if (message.type === 'memory_update') {
								const label = document.getElementById('memoryLabel');
								if (message.isRunning) {
									label.innerText = 'Memory: ' + message.memoryMb.toFixed(2) + ' MB';
								} else {
									label.innerText = 'Process Stopped.';
								}
							}
						});
					</script>
				</body>
			</html>`;
}

// This method is called when your extension is deactivated
export function deactivate() {
	import('pidusage').then(pidusage => pidusage.clear());
}
