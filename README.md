# C/C++ Memory Graph for VS Code

Bring the powerful, real-time memory profiling graphs of **Visual Studio** directly into your **Visual Studio Code** environment. Designed specifically for C/C++ developers who want an instantaneous, zero-configuration diagnostic tool to detect memory leaks and monitor footprint trends during active debug sessions.

Works flawlessly on **ZorinOS / Linux**, **macOS**, and **Windows**.

## 📸 Preview

*Featuring a sleek, theme-adaptive dark UI, precise point-hover columns, customizable sampling, and automated panel lifecycle controls.*

## 🌟 Key Features

* **Instantaneous Feedback:** Catch memory leaks visually *the second they occur* by watching your heap slope over time instead of waiting to run a heavy external profiler.

* **True Cross-Platform Support:** Relies on robust, platform-native metrics abstracted elegantly for Linux, macOS, and Windows.

* **Zero Configuration Integration:** Automatically pops open alongside your code editor the moment you launch a C++ debug session.

* **High-Performance Rendering:** Uses `Chart.js` for extremely efficient rendering that keeps resource overhead minimal, leaving your machine's power dedicated to compiling and running your code.

* **Theme-Adaptive Aesthetics:** Automatically detects your active VS Code color palette to draw grid lines, labels, and legends that match your workspace perfectly.

* **Customizable Sampling Rates:** Toggle between Fast (100ms), Normal (500ms), and Slow (1000ms) intervals on-the-fly to adapt to your debugging depth.

* **Smart Lifespans:** Optional "Close graph when debug ends" setting to clean up your workspace automatically when the process terminates.

## 🛠 Supported Debuggers

The extension dynamically intercepts the Debug Adapter Protocol (DAP) process events. Out of the box, it supports the leading C++ debugging frameworks:

* **Microsoft C/C++ extension** (`cppdbg`)

* **CodeLLDB / LLDB-DAP** (`lldb-dap`)

## 🏗 Architecture & Separation of Concerns

This extension was designed with robust architectural boundaries to prevent memory leaks in the IDE and ensure snappy UI rendering:
```
┌────────────────────────────────────────────────────────┐
│             Extension Host (Node.js/Backend)           │
│  - Listens to Debug Adapter (DAP) Events               │
│  - Hooks OS Process ID (PID) via 'pidusage'            │
│  - Manages Polling Intervals                           │
└─────────────────────────┬──────────────────────────────┘
│ (Secure Webview postMessage IPC)
▼
┌────────────────────────────────────────────────────────┐
│            Isolated Frontend Webview (HTML5)           │
│  - Completely sandboxed from OS/Filesystem             │
│  - Renders UI controls & reactive state                │
│  - Plots metrics using Chart.js on Canvas              │
└────────────────────────────────────────────────────────┘
```
## 🚀 Getting Started (Development Mode)

If you are building the extension from source, follow these quick steps:

### Prerequisites

* [Node.js](https://nodejs.org/) installed on your machine.

* A C++ compiler setup (GCC on ZorinOS/Linux, Clang on macOS, MSVC on Windows).

### Setup and Running

1. Clone this repository to your local workspace:
```
git clone https://github.com/your-username/cpp-mem-graph.git
cd cpp-mem-graph
```

2. Install dependencies:
```
npm install
```

3. Open the project in VS Code:
```
code .
```

4. Press `F5` to open a new **Extension Development Host** window.

5. In the new window, open any C/C++ workspace and start debugging your application (`F5`). The **C/C++ Memory Graph** panel will slide open right beside your editor!

## ⚙ How to Use

1. **Auto-Launch:** Simply start your standard C/C++ debug configuration. The tool detects the program start and triggers automatically.

2. **Manual Launch:** You can also trigger the graph manually at any time using the Command Palette:

* Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)

* Run the command: `C/C++ Memory Graph: Show Graph`

3. **Customize Sampling:** Change how frequently the process memory is polled by using the **Sampling Rate** dropdown at the top. The extension remembers your preferred selection across sessions!

4. **Auto-Cleanup:** Check **Close graph when debug ends** to automatically tear down the visualizer when your target program exits.

## 📄 License
This project is licensed under the [MIT License](LICENSE) - see the LICENSE file for details.