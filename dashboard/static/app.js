let logContainer;
const maxLogs = 100;
let eventSource;
let firstMessageReceived = false;

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    logContainer = document.getElementById('logContainer');
    
    // Connect to event stream
    eventSource = new EventSource('/stream');

    eventSource.onmessage = function(event) {
        // Clear "Connecting..." message on first log entry
        if (!firstMessageReceived) {
            logContainer.innerHTML = '';
            firstMessageReceived = true;
        }
        const data = JSON.parse(event.data);
        addLogEntry(data);
    };

    eventSource.onerror = function(error) {
        console.error('EventSource error:', error);
        addLogEntry({
            type: 'log',
            timestamp: new Date().toISOString(),
            message: 'Connection to server lost. Retrying...',
            level: 'error'
        });
    };
    
    // Update stats immediately and then every 5 seconds
    updateStats();
    setInterval(updateStats, 5000);
});

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    // If less than 2 hours, show relative time
    if (diffHours < 2) {
        if (diffMins < 1) return 'just now';
        if (diffMins === 1) return '1 min ago';
        if (diffMins < 60) return `${diffMins} mins ago`;
        if (diffHours === 1) return '1 hour ago';
    }
    
    // Otherwise show full date and time
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function addLogEntry(data) {
    const entry = document.createElement('div');
    entry.className = 'mb-2 log-entry';
    
    const timeStr = formatTimestamp(data.timestamp);
    
    if (data.type === 'request') {
        const statusClass = data.status >= 200 && data.status < 300 ? 's2xx' :
                           data.status >= 300 && data.status < 400 ? 's3xx' :
                           data.status >= 400 && data.status < 500 ? 's4xx' : 's5xx';
        
        const statusColors = {
            's2xx': 'bg-green-500/20 text-green-300 border border-green-500/40',
            's3xx': 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
            's4xx': 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
            's5xx': 'bg-red-500/20 text-red-300 border border-red-500/40'
        };
        
        const methodColors = {
            'GET': 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
            'POST': 'bg-green-500/20 text-green-300 border border-green-500/40',
            'PUT': 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
            'DELETE': 'bg-red-500/20 text-red-300 border border-red-500/40',
            'PATCH': 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
        };
        
        const ingressClass = data.ingress === 2 ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 animate-pulse' : 
                            (data.ingress === 0 || data.ingress === 1) ? 'bg-green-500/20 text-green-300 border border-green-500/40' : 'bg-gray-500/20 text-gray-300 border border-gray-500/40';
        const ingressLabel = data.ingress === 2 ? 'Rule 2 (404 catch-all)' : `Rule ${data.ingress}`;
        
        entry.innerHTML = `
            <div class="flex flex-wrap items-center gap-2 text-xs md:text-sm p-2 rounded-md bg-secondary/50 border border-border">
                <span class="text-muted-foreground text-[10px] md:text-xs">[${timeStr}]</span>
                <span class="px-2 py-0.5 rounded text-[10px] md:text-xs font-medium ${methodColors[data.method] || 'bg-gray-500/20 text-gray-300 border border-gray-500/40'}">${data.method}</span>
                <span class="px-2 py-0.5 rounded text-[10px] md:text-xs font-medium ${statusColors[statusClass]}">${data.status}</span>
                <span class="font-semibold text-accent break-all">${data.host}</span><span class="text-foreground break-all">${data.path}</span>
                <span class="text-muted-foreground">→</span>
                <span class="text-primary break-all">${data.origin}</span>
                <span class="px-2 py-0.5 rounded text-[10px] md:text-xs font-medium ${ingressClass}">${ingressLabel}</span>
            </div>
        `;
    } else if (data.type === 'connection') {
        const levelClass = data.level === 'success' ? 'bg-green-500/10 border-green-500/40' : 'bg-red-500/10 border-red-500/40';
        const textClass = data.level === 'success' ? 'text-green-300' : 'text-red-300';
        entry.innerHTML = `
            <div class="flex items-center gap-2 text-xs md:text-sm p-2 rounded-md border ${levelClass}">
                <span class="text-muted-foreground text-[10px] md:text-xs">[${timeStr}]</span>
                <span class="${textClass}">${data.level === 'success' ? '✓' : '✗'} ${data.message}</span>
            </div>
        `;
    } else if (data.type === 'log') {
        const levelClass = data.level === 'error' ? 'bg-red-500/10 border-red-500/40' : 'bg-yellow-500/10 border-yellow-500/40';
        const textClass = data.level === 'error' ? 'text-red-300' : 'text-yellow-300';
        entry.innerHTML = `
            <div class="text-xs md:text-sm p-2 rounded-md border ${levelClass}">
                <span class="text-muted-foreground text-[10px] md:text-xs">[${timeStr}]</span>
                <span class="font-semibold ${textClass}">${data.level.toUpperCase()}:</span> <span class="break-words text-foreground">${data.message}</span>
            </div>
        `;
    }
    
    logContainer.appendChild(entry);
    
    // Keep only last N logs
    while (logContainer.children.length > maxLogs) {
        logContainer.removeChild(logContainer.firstChild);
    }
    
    // Auto-scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
}

function clearLogs() {
    logContainer.innerHTML = '';
    firstMessageReceived = false;
}

function filterLogs() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const entries = logContainer.getElementsByClassName('log-entry');
    
    for (let entry of entries) {
        const text = entry.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            entry.style.display = '';
        } else {
            entry.style.display = 'none';
        }
    }
}

// Fetch stats every 5 seconds
function updateStats() {
    fetch('/stats')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('containerStatus').textContent = 'Error';
                document.getElementById('containerStatus').className = 'inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20';
                return;
            }
            
            document.getElementById('containerStatus').textContent = data.status;
            document.getElementById('containerStatus').className = 
                data.status === 'running' ? 'inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20' : 'inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-500/10 text-gray-500 border border-gray-500/20';
            
            document.getElementById('cpuUsage').textContent = data.cpu_percent + '%';
            document.getElementById('memoryUsage').textContent = data.memory_mb + ' MB';
            
            // Update request stats
            if (data.total_requests !== undefined) {
                document.getElementById('totalRequests').textContent = data.total_requests;
            }
            if (data.success_rate !== undefined) {
                document.getElementById('successRate').textContent = data.success_rate + '%';
            }
        })
        .catch(error => console.error('Error fetching stats:', error));
}
