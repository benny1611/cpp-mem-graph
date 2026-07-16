const vscode = acquireVsCodeApi();

// Grab config passed from the backend
let currentRate = window.VSCODE_CONFIG.initialRate;
let autoCloseEnabled = window.VSCODE_CONFIG.initialAutoClose;
let sessionStartTime = null;
const TIME_WINDOW_MS = 60000; 

// Setup initial DOM states
const sampleRateDropdown = document.getElementById('sampleRate');
const autoCloseCheckbox = document.getElementById('autoClose');

const rates = [
    { val: 100, label: "100 ms (Fast)" },
    { val: 500, label: "500 ms (Normal)" },
    { val: 1000, label: "1000 ms (Slow)" }
];
rates.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.val;
    opt.textContent = r.label;
    if (r.val === currentRate) {opt.selected = true;}
    sampleRateDropdown.appendChild(opt);
});
autoCloseCheckbox.checked = autoCloseEnabled;

// Theme Detection
const textColor = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-foreground').trim() || '#ccc';
const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editorLineNumber-foreground').trim() || '#444';

// Initialize Chart
const ctx = document.getElementById('memoryChart').getContext('2d');
const memoryChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Memory Usage (MB)',
            data: [],
            borderColor: '#007acc',
            backgroundColor: 'rgba(0, 122, 204, 0.2)',
            borderWidth: 2,
            pointRadius: 0,        // Keeps it lean during normal drawing
            pointHoverRadius: 5,   // Dynamically pops a 5px dot into view on hover!
            fill: true,
            tension: 0.3
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        
        // 1. CAPTURE HOVERS ANYWHERE ALONG THE X-AXIS
        interaction: {
            intersect: false, // True hover intersection is off; mouse doesn't need to touch the line
            mode: 'index'     // Snaps cleanly to the nearest timestamp column index
        },
        
        plugins: { 
            legend: { labels: { color: textColor } },
            
            // 2. STYLIZE THE TOOLTIP TO MATCH VS CODE
            tooltip: {
                enabled: true,
                backgroundColor: 'rgba(30, 30, 30, 0.95)', // Sleek dark panel vibe
                titleColor: '#ffffff',
                bodyColor: '#007acc',
                borderColor: gridColor,
                borderWidth: 1,
                displayColors: false, // Hides the useless generic square color box
                padding: 10,
                callbacks: {
                    label: function(context) {
                        // Formats the hover value to explicitly read "Memory: XX.XX MB"
                        return `Memory: ${parseFloat(context.parsed.y).toFixed(2)} MB`;
                    }
                }
            }
        },
        scales: {
            x: { ticks: { color: textColor, maxTicksLimit: 10 }, grid: { color: gridColor } },
            y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor }, title: { display: true, text: 'Megabytes (MB)', color: textColor } }
        }
    }
});

// Event Listeners
sampleRateDropdown.addEventListener('change', (e) => {
    currentRate = parseInt(e.target.value, 10);
    vscode.postMessage({ type: 'set_update_interval', ms: currentRate });
});

autoCloseCheckbox.addEventListener('change', (e) => {
    vscode.postMessage({ type: 'set_auto_close', value: e.target.checked });
});

// Message Interception
window.addEventListener('message', event => {
    const message = event.data; 
    if (message.type === 'memory_update') {
        const statusLabel = document.getElementById('statusLabel');
        
        if (message.isRunning) {
            statusLabel.innerText = 'Status: Profiling process...';
            
            // If this is the first data point of the session, lock in the start time
            if (!sessionStartTime) {
                sessionStartTime = message.timestamp;
            }
            
            // Calculate delta seconds safely
            const secondsElapsed = Math.floor((message.timestamp - sessionStartTime) / 1000);
            
            memoryChart.data.labels.push(`${secondsElapsed}s`);
            memoryChart.data.datasets[0].data.push(message.memoryMb);

            const maxDataPoints = Math.floor(TIME_WINDOW_MS / currentRate);
            while (memoryChart.data.labels.length > maxDataPoints) {
                memoryChart.data.labels.shift();
                memoryChart.data.datasets[0].data.shift();
            }
            memoryChart.update('none');
        } else {
            statusLabel.innerText = 'Status: Process Stopped.';
            
            // Reset the start time so the next debug session starts fresh at 0s
            sessionStartTime = null; 
        }
    }
});