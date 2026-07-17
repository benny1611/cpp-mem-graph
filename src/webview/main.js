const vscode = acquireVsCodeApi();

let currentRate = window.VSCODE_CONFIG.initialRate;
let autoCloseEnabled = window.VSCODE_CONFIG.initialAutoClose;
let sessionStartTime = null;
let pauseStartTime = null; // Used to track time offset while paused
const TIME_WINDOW_MS = 60000; 

const sampleRateDropdown = document.getElementById('sampleRate');
const autoCloseCheckbox = document.getElementById('autoClose');
const pauseOverlay = document.getElementById('pauseOverlay');

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

const textColor = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-foreground').trim() || '#ccc';
const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editorLineNumber-foreground').trim() || '#444';

const ctx = document.getElementById('memoryChart').getContext('2d');

// Restored Chart.js Configuration
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
            pointRadius: 0,
            pointHoverRadius: 5,
            fill: true,
            tension: 0.3
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
            intersect: false, 
            mode: 'index'     
        },
        plugins: { 
            legend: { labels: { color: textColor } },
            tooltip: {
                enabled: true,
                backgroundColor: 'rgba(30, 30, 30, 0.95)',
                titleColor: '#ffffff',
                bodyColor: '#007acc',
                borderColor: gridColor,
                borderWidth: 1,
                displayColors: false,
                padding: 10,
                callbacks: {
                    label: function(context) {
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

sampleRateDropdown.addEventListener('change', (e) => {
    currentRate = parseInt(e.target.value, 10);
    vscode.postMessage({ type: 'set_update_interval', ms: currentRate });
});
autoCloseCheckbox.addEventListener('change', (e) => {
    vscode.postMessage({ type: 'set_auto_close', value: e.target.checked });
});

window.addEventListener('message', event => {
    const message = event.data; 
    if (message.type === 'memory_update') {
        const statusLabel = document.getElementById('statusLabel');
        
        if (message.isRunning) {
            
            if (message.isPaused) {
                // HANDLE HALT (Breakpoint)
                statusLabel.innerText = 'Status: Paused (Breakpoint)...';
                pauseOverlay.style.display = 'flex';
                if (!pauseStartTime) {
                    pauseStartTime = message.timestamp;
                }
            } else {
                // HANDLE RUNNING / RESUMING
                statusLabel.innerText = 'Status: Profiling process...';
                pauseOverlay.style.display = 'none';
                
                // If we are un-pausing, we mathematically shift our session start time 
                // so the X-axis of the graph doesn't jump forward by a big gap.
                if (pauseStartTime) {
                    sessionStartTime += (message.timestamp - pauseStartTime);
                    pauseStartTime = null;
                }

                // Clear arrays ONLY if this is a brand new debugging session
                if (!sessionStartTime) {
                    sessionStartTime = message.timestamp;
                    memoryChart.data.labels = [];
                    memoryChart.data.datasets[0].data = [];
                }
                
                // Only graph real data (skip dummy state-change messages)
                if (!message.isStateChange) {
                    const secondsElapsed = Math.floor((message.timestamp - sessionStartTime) / 1000);
                    
                    memoryChart.data.labels.push(`${secondsElapsed}s`);
                    memoryChart.data.datasets[0].data.push(message.memoryMb);

                    const maxDataPoints = Math.floor(TIME_WINDOW_MS / currentRate);
                    while (memoryChart.data.labels.length > maxDataPoints) {
                        memoryChart.data.labels.shift();
                        memoryChart.data.datasets[0].data.shift();
                    }
                    memoryChart.update('none');
                }
            }
        } else {
            // DO NOT empty the chart array here! 
            // Just clear the timestamps. The chart data stays visible until un-paused.
            statusLabel.innerText = 'Status: Process Stopped.';
            pauseOverlay.style.display = 'none';
            sessionStartTime = null; 
            pauseStartTime = null;
        }
    }
});