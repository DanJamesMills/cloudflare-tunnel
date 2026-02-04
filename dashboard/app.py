from flask import Flask, render_template, request, redirect, url_for, session, Response
import docker
import re
from datetime import datetime
from functools import wraps
import os
import json
import time

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.secret_key = os.environ.get('DASHBOARD_SECRET_KEY', 'change-me-in-production')

# Dashboard credentials from environment variables
DASHBOARD_USER = os.environ.get('DASHBOARD_USER', 'admin')
DASHBOARD_PASSWORD = os.environ.get('DASHBOARD_PASSWORD', 'admin')

# Initialize Docker client
docker_client = docker.from_env()

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
    return render_template('dashboard.html')

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
        status = int(status_match.group(1)) if status_match else 0
        
        ingress_match = re.search(ingress_pattern, line)
        ingress = int(ingress_match.group(1)) if ingress_match else -1
        
        origin_match = re.search(origin_pattern, line)
        origin = origin_match.group(1) if origin_match else "unknown"
        
        return {
            'type': 'request',
            'timestamp': timestamp,
            'method': method,
            'path': path,
            'host': host,
            'status': status,
            'ingress': ingress,
            'origin': origin
        }
    
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
            container = docker_client.containers.get('cloudflared-tunnel')
            
            # Stream logs
            for line in container.logs(stream=True, follow=True, tail=0):
                line_str = line.decode('utf-8').strip()
                if line_str:
                    parsed = parse_log_line(line_str)
                    if parsed:
                        yield f"data: {json.dumps(parsed)}\n\n"
                        
        except docker.errors.NotFound:
            error_data = {
                'type': 'log',
                'timestamp': datetime.now().isoformat(),
                'message': 'Container cloudflared-tunnel not found',
                'level': 'error'
            }
            yield f"data: {json.dumps(error_data)}\n\n"
        except Exception as e:
            error_data = {
                'type': 'log',
                'timestamp': datetime.now().isoformat(),
                'message': f'Error: {str(e)}',
                'level': 'error'
            }
            yield f"data: {json.dumps(error_data)}\n\n"
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/stats')
@login_required
def stats():
    """Get container stats"""
    try:
        container = docker_client.containers.get('cloudflared-tunnel')
        stats = container.stats(stream=False)
        
        # Calculate CPU percentage
        cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - stats['precpu_stats']['cpu_usage']['total_usage']
        system_delta = stats['cpu_stats']['system_cpu_usage'] - stats['precpu_stats']['system_cpu_usage']
        cpu_percent = (cpu_delta / system_delta) * 100.0 if system_delta > 0 else 0.0
        
        # Calculate memory usage
        mem_usage = stats['memory_stats']['usage']
        mem_limit = stats['memory_stats']['limit']
        mem_percent = (mem_usage / mem_limit) * 100.0 if mem_limit > 0 else 0.0
        
        return {
            'status': container.status,
            'cpu_percent': round(cpu_percent, 2),
            'memory_mb': round(mem_usage / 1024 / 1024, 2),
            'memory_percent': round(mem_percent, 2)
        }
    except Exception as e:
        return {'error': str(e)}, 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=False)
