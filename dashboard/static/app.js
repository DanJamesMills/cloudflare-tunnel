const logContainer = document.getElementById('logContainer');
const maxLogs = 100;

// Connect to event stream
const eventSource = new EventSource('/stream');

eventSource.onmessage = function(event) {
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
    entry.className = 'log-entry';
    
    const timeStr = formatTimestamp(data.timestamp);
    
    if (data.type === 'request') {
        entry.className += ' request border-l-4 border-l-[#569cd6] pl-3 py-2 mb-1';
        
        const statusClass = data.status >= 200 && data.status < 300 ? 's2xx' :
                           data.status >= 300 && data.status < 400 ? 's3xx' :
                           data.status >= 400 && data.status < 500 ? 's4xx' : 's5xx';
        
        const statusColors = {
            's2xx': 'bg-green-700 text-white',
            's3xx': 'bg-blue-600 text-white',
            's4xx': 'bg-yellow-600 text-black',
            's5xx': 'bg-red-600 text-white'
        };
        
        const methodColors = {
            'GET': 'bg-blue-700 text-white',
            'POST': 'bg-green-700 text-white',
            'PUT': 'bg-yellow-600 text-black',
            'DELETE': 'bg-red-600 text-white',
            'PATCH': 'bg-orange-600 text-white'
        };
        
        const ingressClass = data.ingress === 2 ? 'rule-2 bg-yellow-600 text-black pulse-animation' : 
                            (data.ingress === 0 || data.ingress === 1) ? 'bg-green-700 text-white' : 'bg-gray-700 text-white';
        const ingressLabel = data.ingress === 2 ? 'Rule 2 (404 catch-all)' : `Rule ${data.ingress}`;
        
        entry.innerHTML = `
            <div class="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                <span class="text-gray-500 text-[10px] md:text-xs">[${timeStr}]</span>
                <span class="px-2 py-0.5 rounded text-[10px] md:text-xs font-bold ${methodColors[data.method] || 'bg-gray-700 text-white'}">${data.method}</span>
                <span class="px-2 py-0.5 rounded text-[10px] md:text-xs font-bold ${statusColors[statusClass]}">${data.status}</span>
                <span class="font-bold text-[#4ec9b0] break-all">${data.host}</span><span class="text-gray-300 break-all">${data.path}</span>
                <span class="text-gray-500">→</span>
                <span class="text-purple-400 break-all">${data.origin}</span>
                <span class="px-2 py-0.5 rounded text-[10px] md:text-xs font-bold ${ingressClass}">${ingressLabel}</span>
            </div>
        `;
    } else if (data.type === 'connection') {
        const levelClass = data.level === 'success' ? 'border-l-[#4ec9b0] bg-green-900/30' : 'border-l-red-600 bg-red-900/30';
        entry.className += ` ${levelClass} border-l-4 pl-3 py-2 mb-1`;
        entry.innerHTML = `
            <div class="flex items-center gap-2 text-xs md:text-sm">
                <span class="text-gray-500 text-[10px] md:text-xs">[${timeStr}]</span>
                ${data.level === 'success' ? '✓' : '✗'} ${data.message}
            </div>
        `;
    } else if (data.type === 'log') {
        const levelClass = data.level === 'error' ? 'border-l-red-600 bg-red-900/30' : 'border-l-yellow-600 bg-yellow-900/30';
        entry.className += ` ${levelClass} border-l-4 pl-3 py-2 mb-1`;
        entry.innerHTML = `
            <div class="text-xs md:text-sm">
                <span class="text-gray-500 text-[10px] md:text-xs">[${timeStr}]</span>
                <span class="font-bold">${data.level.toUpperCase()}:</span> <span class="break-words">${data.message}</span>
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
}

// Fetch stats every 5 seconds
function updateStats() {
    fetch('/stats')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('containerStatus').textContent = 'Error';
                document.getElementById('containerStatus').className = 'inline-block mt-1 px-3 py-1 rounded-full text-xs font-semibold';
                return;
            }
            
            document.getElementById('containerStatus').textContent = data.status;
            document.getElementById('containerStatus').className = 
                data.status === 'running' ? 'inline-block mt-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-700 text-white' : 'inline-block mt-1 px-3 py-1 rounded-full text-xs font-semibold bg-gray-700 text-white';
            
            document.getElementById('cpuUsage').textContent = data.cpu_percent + '%';
            document.getElementById('memUsage').textContent = data.memory_mb + ' MB';
        })
        .catch(error => console.error('Error fetching stats:', error));
}

// Update stats immediately and then every 5 seconds
updateStats();
setInterval(updateStats, 5000);
