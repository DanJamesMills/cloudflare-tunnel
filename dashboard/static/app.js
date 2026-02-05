let logContainer;
const maxLogs = 100;
let eventSource;
let firstMessageReceived = false;
let totalRequests = 0;
let successfulRequests = 0;
let errorRequests = 0;

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    logContainer = document.getElementById('logContainer');
    
    // Load historical logs first
    fetch('/logs/history')
        .then(response => response.json())
        .then(data => {
            if (data.logs && data.logs.length > 0) {
                firstMessageReceived = true;
                logContainer.innerHTML = '';
                // Reverse array so oldest logs are added first (newest end up at top)
                data.logs.reverse().forEach(log => addLogEntry(log));
            }
        })
        .catch(error => console.error('Error loading historical logs:', error));
    
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
        totalRequests++;
        // Status 0 means unknown/not captured - treat as success since request made it through tunnel
        // Status 200-399 is explicit success
        // Only count as error if status is 400+
        const isError = data.status >= 400;
        
        if (isError) {
            errorRequests++;
        } else {
            // Count as success if status is 0 (unknown but delivered) or 2xx-3xx
            successfulRequests++;
        }
        
        // Update stats display
        document.getElementById('totalRequests').textContent = totalRequests;
        document.getElementById('successfulRequests').textContent = successfulRequests;
        document.getElementById('errorRequests').textContent = errorRequests;
        
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
        
        const entryId = 'entry-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        entry.innerHTML = `
            <div class="rounded-md bg-secondary/50 border border-border overflow-hidden">
                <div class="flex flex-wrap items-center gap-2 text-xs md:text-sm p-2 cursor-pointer hover:bg-secondary/70 transition-colors" onclick="toggleDetails('${entryId}')">
                    <span class="text-muted-foreground text-[10px] md:text-xs">[${timeStr}]</span>
                    <span class="px-2 py-0.5 rounded text-[10px] md:text-xs font-medium ${methodColors[data.method] || 'bg-gray-500/20 text-gray-300 border border-gray-500/40'}">${data.method}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] md:text-xs font-medium ${statusColors[statusClass]}">${data.status}</span>
                    <span class="font-semibold text-accent break-all">${data.host}</span><span class="text-foreground break-all">${data.path}</span>
                    <span class="text-muted-foreground">→</span>
                    <span class="text-primary break-all">${data.origin}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] md:text-xs font-medium ${ingressClass}">${ingressLabel}</span>
                    <svg class="w-4 h-4 text-muted-foreground ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </div>
                <div id="${entryId}" class="hidden border-t border-border p-3 bg-background/50 text-xs space-y-2">
                    <div><span class="text-muted-foreground">Full URL:</span> <span class="text-foreground font-mono break-all">${data.path}</span></div>
                    <div><span class="text-muted-foreground">Origin Service:</span> <span class="text-primary font-mono break-all">${data.origin}</span> <span class="text-muted-foreground/60 text-[10px]" title="The backend service where cloudflared forwarded this request">(where request was sent)</span></div>
                    <div><span class="text-muted-foreground">Ingress Rule:</span> <span class="text-accent">${ingressLabel}</span> <span class="text-muted-foreground/60 text-[10px]" title="Which routing rule in your Cloudflare Tunnel config matched this request">(matching route)</span></div>
                    <div><span class="text-muted-foreground">Timestamp:</span> <span class="text-foreground">${data.timestamp}</span></div>
                    ${data.headers ? `
                        <div class="pt-2 border-t border-border">
                            <div class="text-muted-foreground font-semibold mb-2">Request Headers:</div>
                            <div class="space-y-1 pl-2">
                                ${Object.entries(data.headers).map(([key, value]) => `
                                    <div class="flex flex-col gap-0.5">
                                        <span class="text-accent text-[10px] font-medium">${key}:</span>
                                        <span class="text-foreground font-mono text-[10px] break-all pl-2">${value}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
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
        // Count error logs in error counter
        if (data.level === 'error') {
            errorRequests++;
            document.getElementById('errorRequests').textContent = errorRequests;
        }
        
        const levelClass = data.level === 'error' ? 'bg-red-500/10 border-red-500/40' : 'bg-yellow-500/10 border-yellow-500/40';
        const textClass = data.level === 'error' ? 'text-red-300' : 'text-yellow-300';
        entry.innerHTML = `
            <div class="text-xs md:text-sm p-3 rounded-md border ${levelClass}">
                <div class="flex items-start gap-2">
                    <span class="text-muted-foreground text-[10px] md:text-xs flex-shrink-0">[${timeStr}]</span>
                    <div class="flex-1 min-w-0">
                        <span class="font-semibold ${textClass}">${data.level.toUpperCase()}:</span>
                        <span class="break-words text-foreground block mt-1">${data.message}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Add new entry at the top instead of bottom
    if (logContainer.firstChild) {
        logContainer.insertBefore(entry, logContainer.firstChild);
    } else {
        logContainer.appendChild(entry);
    }
    
    // Keep only last N logs (remove from bottom)
    while (logContainer.children.length > maxLogs) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

function clearLogs() {
    // Clear display
    logContainer.innerHTML = '';
    firstMessageReceived = false;
    totalRequests = 0;
    successfulRequests = 0;
    errorRequests = 0;
    document.getElementById('totalRequests').textContent = '0';
    document.getElementById('successfulRequests').textContent = '0';
    document.getElementById('errorRequests').textContent = '0';
    
    // Clear logs on backend (file and buffer)
    fetch('/logs/clear', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            console.error('Failed to clear logs:', data.error);
        }
    })
    .catch(error => console.error('Error clearing logs:', error));
}

function toggleDetails(entryId) {
    const details = document.getElementById(entryId);
    if (details) {
        details.classList.toggle('hidden');
    }
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
        .then((data) => {
            console.log('Stats update:', data); // Debug log
            if (data.error) {
                document.getElementById('containerStatus').textContent = 'Error';
                document.getElementById('containerStatus').className = 'inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20';
                return;
            }
            
            document.getElementById('containerStatus').textContent = data.status;
            document.getElementById('containerStatus').className = 
                data.status === 'running' ? 'inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20' : 'inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-500/10 text-gray-500 border border-gray-500/20';
            
            document.getElementById('cpuUsage').textContent = data.cpu_percent.toFixed(1) + '%';
            document.getElementById('memoryUsage').textContent = data.memory_mb.toFixed(1) + ' MB';
        })
        .catch(error => console.error('Error fetching stats:', error));
}
