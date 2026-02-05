from flask import Flask, render_template, request, redirect, url_for, session, Response
import docker
import re
from datetime import datetime
from functools import wraps
import os
import json
import time
from collections import deque
import threading

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.secret_key = os.environ.get('DASHBOARD_SECRET_KEY', 'change-me-in-production')

# Dashboard credentials from environment variables
DASHBOARD_USER = os.environ.get('DASHBOARD_USER', 'admin')
DASHBOARD_PASSWORD = os.environ.get('DASHBOARD_PASSWORD', 'admin')
TUNNEL_NAME = os.environ.get('TUNNEL_NAME', 'Cloudflare Tunnel')

# Log storage configuration
MAX_LOG_ENTRIES = int(os.environ.get('MAX_LOG_ENTRIES', '500'))
LOG_FILE_PATH = os.environ.get('LOG_FILE_PATH', '/app/logs/access.log')
log_buffer = deque(maxlen=MAX_LOG_ENTRIES)
log_lock = threading.Lock()

# Ensure log directory exists
os.makedirs(os.path.dirname(LOG_FILE_PATH), exist_ok=True)

def load_logs_from_file():
    """Load logs from file into memory buffer on startup"""
    if os.path.exists(LOG_FILE_PATH):
        try:
            with open(LOG_FILE_PATH, 'r') as f:
                for line in f:
                    try:
                        log_entry = json.loads(line.strip())
                        log_buffer.append(log_entry)
                    except json.JSONDecodeError:
                        continue
            print(f"Loaded {len(log_buffer)} logs from {LOG_FILE_PATH}")
        except Exception as e:
            print(f"Error loading logs from file: {e}")

def write_log_to_file(log_entry):
    """Append log entry to file"""
    try:
        with open(LOG_FILE_PATH, 'a') as f:
            f.write(json.dumps(log_entry) + '\n')
    except Exception as e:
        print(f"Error writing log to file: {e}")

def trim_log_file():
    """Keep only the last MAX_LOG_ENTRIES in the log file"""
    try:
        if os.path.exists(LOG_FILE_PATH):
            with open(LOG_FILE_PATH, 'r') as f:
                lines = f.readlines()
            
            # Keep only the last MAX_LOG_ENTRIES lines
            if len(lines) > MAX_LOG_ENTRIES:
                with open(LOG_FILE_PATH, 'w') as f:
                    f.writelines(lines[-MAX_LOG_ENTRIES:])
                print(f"Trimmed log file to {MAX_LOG_ENTRIES} entries")
    except Exception as e:
        print(f"Error trimming log file: {e}")

# Load existing logs on startup
load_logs_from_file()

# Initialize Docker client
docker_client = docker.from_env()

def get_cloudflared_container():
    """Find the cloudflared container from the same docker-compose project"""
    try:
        # First, check if custom container name is set via environment variable
        custom_name = os.environ.get('CLOUDFLARED_CONTAINER_NAME')
        if custom_name:
            return docker_client.containers.get(custom_name)
        
        # Try to find by service name in compose project
        containers = docker_client.containers.list(filters={'label': 'com.docker.compose.service=cloudflared'})
        if containers:
            return containers[0]
        
        # Fallback to old hardcoded name for backwards compatibility
        return docker_client.containers.get('cloudflared-tunnel')
    except:
        return None

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        if username == DASHBOARD_USER and password == DASHBOARD_PASSWORD:
            session['logged_in'] = True
            return redirect(url_for('dashboard'))
        else:
            return render_template('login.html', error='Invalid credentials')
    
    return render_template('login.html')

@app.route('/logout', methods=['GET', 'POST'])
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('login'))

@app.route('/')
@login_required
def dashboard():
    cache_buster = str(int(time.time()))
    return render_template('dashboard.html', cache_buster=cache_buster, tunnel_name=TUNNEL_NAME)

def parse_log_line(line):
    """Parse log line and return structured data"""
    
    # Extract timestamp
    timestamp_match = re.search(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})', line)
    timestamp = timestamp_match.group(1) if timestamp_match else datetime.now().isoformat()
    
    # Patterns for extracting data
    request_pattern = r'(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)'
    host_pattern = r'host=([^\s]+)'
    status_pattern = r'status=(\d+)'
    ingress_pattern = r'ingressRule=(\d+)'
    origin_pattern = r'originService=([^\s]+)'
    
    # Check for HTTP requests
    request_match = re.search(request_pattern, line)
    if request_match:
        method = request_match.group(1)
        path = request_match.group(2)
        
        host_match = re.search(host_pattern, line)
        host = host_match.group(1) if host_match else "unknown"
        
        status_match = re.search(status_pattern, line)
        # Default to 200 if no status found - request made it through tunnel successfully
        status = int(status_match.group(1)) if status_match else 200
        
        ingress_match = re.search(ingress_pattern, line)
        ingress = int(ingress_match.group(1)) if ingress_match else -1
        
        origin_match = re.search(origin_pattern, line)
        origin = origin_match.group(1) if origin_match else "unknown"
        
        # Extract all headers from JSON headers object
        headers = None
        
        # Try to extract from JSON headers field - find headers= and extract the full JSON
        headers_start = line.find('headers=')
        if headers_start != -1:
            try:
                # Find the JSON object starting with {
                json_start = line.find('{', headers_start)
                if json_start != -1:
                    # Count braces to find the end of the JSON object
                    brace_count = 0
                    json_end = json_start
                    for i in range(json_start, len(line)):
                        if line[i] == '{':
                            brace_count += 1
                        elif line[i] == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                json_end = i + 1
                                break
                    
                    headers_str = line[json_start:json_end]
                    headers_json = json.loads(headers_str)
                    
                    # Convert all header values from lists to strings
                    headers = {}
                    for key, value in headers_json.items():
                        if isinstance(value, list):
                            headers[key] = value[0] if value else ''
                        else:
                            headers[key] = value
            except Exception as e:
                print(f"Header parsing error: {e}")  # Debug log
                pass  # If JSON parsing fails, headers will be None
        
        result = {
            'type': 'request',
            'timestamp': timestamp,
            'method': method,
            'path': path,
            'host': host,
            'status': status,
            'ingress': ingress,
            'origin': origin
        }
        
        # Add all headers if present
        if headers:
            result['headers'] = headers
            
        return result
    
    # Check for connection events
    if 'Connection' in line or 'connected' in line.lower():
        if 'registered' in line.lower() or 'established' in line.lower():
            return {
                'type': 'connection',
                'timestamp': timestamp,
                'message': 'Tunnel connected',
                'level': 'success'
            }
        elif 'disconnected' in line.lower() or 'closed' in line.lower():
            return {
                'type': 'connection',
                'timestamp': timestamp,
                'message': 'Tunnel disconnected',
                'level': 'error'
            }
    
    # Check for errors
    if 'ERR' in line or 'error' in line.lower():
        # Strip timestamp and ERR prefix from the message to avoid duplication
        clean_message = re.sub(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+(ERR|ERROR)?\s*', '', line)
        error_snippet = clean_message[:150] + "..." if len(clean_message) > 150 else clean_message
        return {
            'type': 'log',
            'timestamp': timestamp,
            'message': error_snippet,
            'level': 'error'
        }
    
    # Check for warnings
    if 'WRN' in line or 'warning' in line.lower():
        # Strip timestamp and WRN prefix from the message to avoid duplication
        clean_message = re.sub(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+(WRN|WARN|WARNING)?\s*', '', line)
        warning_snippet = clean_message[:150] + "..." if len(clean_message) > 150 else clean_message
        return {
            'type': 'log',
            'timestamp': timestamp,
            'message': warning_snippet,
            'level': 'warning'
        }
    
    return None

@app.route('/stream')
@login_required
def stream():
    """Stream logs using Server-Sent Events"""
    def generate():
        try:
            container = get_cloudflared_container()
            if not container:
                raise docker.errors.NotFound('Cloudflared container not found')
            
            # Stream logs
            for line in container.logs(stream=True, follow=True, tail=0):
                line_str = line.decode('utf-8').strip()
                if line_str:
                    parsed = parse_log_line(line_str)
                    if parsed:
                        # Store in buffer and file
                        with log_lock:
                            log_buffer.append(parsed)
                            write_log_to_file(parsed)
                            # Periodically trim log file (every 100 entries)
                            if len(log_buffer) % 100 == 0:
                                trim_log_file()
                        # Send to client
                        yield f"data: {json.dumps(parsed)}\n\n"
                        
        except docker.errors.NotFound:
            error_data = {
                'type': 'log',
                'timestamp': datetime.now().isoformat(),
                'message': 'Cloudflared container not found',
                'level': 'error'
            }
            with log_lock:
                log_buffer.append(error_data)
                write_log_to_file(error_data)
            yield f"data: {json.dumps(error_data)}\n\n"
        except Exception as e:
            error_data = {
                'type': 'log',
                'timestamp': datetime.now().isoformat(),
                'message': f'Error: {str(e)}',
                'level': 'error'
            }
            with log_lock:
                log_buffer.append(error_data)
                write_log_to_file(error_data)
            yield f"data: {json.dumps(error_data)}\n\n"
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/logs/history')
@login_required
def logs_history():
    """Get historical logs from buffer"""
    with log_lock:
        # Return logs in reverse chronological order (newest first)
        return {'logs': list(reversed(list(log_buffer)))}

@app.route('/logs/clear', methods=['POST'])
@login_required
def clear_logs():
    """Clear all logs from buffer and file"""
    with log_lock:
        log_buffer.clear()
        # Clear the log file
        try:
            with open(LOG_FILE_PATH, 'w') as f:
                pass  # Just open and close to truncate the file
            return {'success': True, 'message': 'Logs cleared'}
        except Exception as e:
            return {'success': False, 'error': str(e)}, 500

@app.route('/stats')
@login_required
def stats():
    """Get container stats"""
    try:
        container = get_cloudflared_container()
        if not container:
            raise docker.errors.NotFound('Cloudflared container not found')
        stats_data = container.stats(stream=False)
        
        # Default values
        cpu_percent = 0.0
        mem_mb = 0.0
        
        # Try to calculate CPU percentage
        try:
            cpu_stats = stats_data.get('cpu_stats', {})
            precpu_stats = stats_data.get('precpu_stats', {})
            
            cpu_usage = cpu_stats.get('cpu_usage', {})
            precpu_usage = precpu_stats.get('cpu_usage', {})
            
            cpu_delta = cpu_usage.get('total_usage', 0) - precpu_usage.get('total_usage', 0)
            system_delta = cpu_stats.get('system_cpu_usage', 0) - precpu_stats.get('system_cpu_usage', 0)
            cpu_count = cpu_stats.get('online_cpus', len(cpu_usage.get('percpu_usage', [1])))
            
            if system_delta > 0 and cpu_count > 0:
                cpu_percent = (cpu_delta / system_delta) * cpu_count * 100.0
        except (KeyError, TypeError, ZeroDivisionError) as e:
            print(f"CPU calculation error: {e}")
        
        # Try to calculate memory usage
        try:
            memory_stats = stats_data.get('memory_stats', {})
            mem_usage = memory_stats.get('usage', memory_stats.get('privateworkingset', 0))
            if mem_usage > 0:
                mem_mb = mem_usage / 1024 / 1024
        except (KeyError, TypeError, ZeroDivisionError) as e:
            print(f"Memory calculation error: {e}")
        
        print(f"Stats fetched - CPU: {cpu_percent:.1f}%, Memory: {mem_mb:.1f}MB")  # Debug log
        
        return {
            'status': container.status,
            'cpu_percent': round(cpu_percent, 2),
            'memory_mb': round(mem_mb, 2)
        }
    except docker.errors.NotFound:
        print("Cloudflared container not found")
        return {'status': 'not found', 'cpu_percent': 0, 'memory_mb': 0}
    except Exception as e:
        print(f"Stats error: {e}")
        return {'status': 'error', 'cpu_percent': 0, 'memory_mb': 0}

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=False)
