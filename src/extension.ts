import * as vscode from 'vscode';
import { MemoryTracker } from './extension/memoryTracker';
import { ExtensionMessage } from './shared/types';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "cpp-mem-graph" is now active!!');

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

			//Load the HTML content
			currentPanel.webview.html = getWebviewContent();

			// The bridge: Listen to the MemoryTracker and post messages to the Webview
			const memoryListener = memoryTracker.ondidUpdateMemory((payload: ExtensionMessage) => {
				if (currentPanel) {
					currentPanel.webview.postMessage(payload);
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
function getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Memory Graph</title>
</head>
<body>
    <h1>Waiting for C++ Debug Session...</h1>
    <script>
        // Frontend listener for the IPC Bridge
        window.addEventListener('message', event => {
            const message = event.data; // This is of type MemoryUpdatePayload
            if (message.type === 'memory_update') {
                console.log('Received memory update on frontend:', message.memoryMb + ' MB');
                // You'll push to Chart.js here!
                document.body.innerHTML = '<h1>Memory: ' + message.memoryMb.toFixed(2) + ' MB</h1>';
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
