#!/usr/bin/env python3
"""
Cloudflare Tunnel Traffic Monitor
Real-time monitoring of tunnel traffic with formatted output
"""

import subprocess
import sys
import re
from datetime import datetime

# ANSI color codes
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'
    GRAY = '\033[90m'

def print_header():
    """Print the monitor header"""
    print(f"\n{Colors.BOLD}{Colors.OKCYAN}{'='*80}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.OKCYAN}  Cloudflare Tunnel Traffic Monitor{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.OKCYAN}{'='*80}{Colors.ENDC}\n")
    print(f"{Colors.GRAY}Monitoring container: cloudflared-tunnel{Colors.ENDC}")
    print(f"{Colors.GRAY}Press Ctrl+C to stop{Colors.ENDC}\n")

def parse_log_line(line):
    """Parse and format log lines to extract useful information"""
    
    # Match HTTP request logs
    # Example: 2024-02-04T10:30:45Z INF Request: GET /api/data HTTP/1.1 host=api.example.com cf-ray=12345
    request_pattern = r'(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)'
    host_pattern = r'host=([^\s]+)'
    status_pattern = r'status=(\d+)'
    ingress_pattern = r'ingressRule=(\d+)'
    origin_pattern = r'originService=([^\s]+)'
    
    # Extract timestamp
    timestamp_match = re.search(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})', line)
    timestamp = timestamp_match.group(1) if timestamp_match else datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
    time_str = timestamp.split('T')[1]  # Just show the time
    
    # Check for HTTP requests
    request_match = re.search(request_pattern, line)
    if request_match:
        method = request_match.group(1)
        path = request_match.group(2)
        
        # Extract host
        host_match = re.search(host_pattern, line)
        host = host_match.group(1) if host_match else "unknown"
        
        # Extract status code
        status_match = re.search(status_pattern, line)
        status = status_match.group(1) if status_match else "---"
        
        # Extract ingress rule
        ingress_match = re.search(ingress_pattern, line)
        ingress = ingress_match.group(1) if ingress_match else "?"
        
        # Extract origin service
        origin_match = re.search(origin_pattern, line)
        origin = origin_match.group(1) if origin_match else "unknown"
        
        # Color code based on status and ingress rule
        if status.startswith('2'):
            status_color = Colors.OKGREEN
        elif status.startswith('3'):
            status_color = Colors.OKCYAN
        elif status.startswith('4'):
            status_color = Colors.WARNING
        elif status.startswith('5'):
            status_color = Colors.FAIL
        else:
            status_color = Colors.GRAY
        
        # Highlight ingress rule 2 (404 catch-all)
        if ingress == "2":
            ingress_color = Colors.WARNING
            ingress_label = f"Rule {ingress} (404 catch-all)"
        else:
            ingress_color = Colors.OKGREEN
            ingress_label = f"Rule {ingress}"
        
        # Color code method
        method_color = Colors.OKBLUE if method == "GET" else Colors.HEADER
        
        # Format output
        print(f"{Colors.GRAY}[{time_str}]{Colors.ENDC} "
              f"{method_color}{method:7}{Colors.ENDC} "
              f"{status_color}{status:3}{Colors.ENDC} "
              f"{Colors.BOLD}{host}{Colors.ENDC}{path} "
              f"{Colors.GRAY}→{Colors.ENDC} {origin} "
              f"{ingress_color}[{ingress_label}]{Colors.ENDC}")
        return True
    
    # Check for connection events
    if 'Connection' in line or 'connected' in line.lower():
        if 'registered' in line.lower() or 'established' in line.lower():
            print(f"{Colors.GRAY}[{time_str}]{Colors.ENDC} {Colors.OKGREEN}✓ Tunnel connected{Colors.ENDC}")
            return True
        elif 'disconnected' in line.lower() or 'closed' in line.lower():
            print(f"{Colors.GRAY}[{time_str}]{Colors.ENDC} {Colors.FAIL}✗ Tunnel disconnected{Colors.ENDC}")
            return True
    
    # Check for errors
    if 'ERR' in line or 'error' in line.lower():
        # Don't show full error, just indicate there was one
        error_snippet = line[:100] + "..." if len(line) > 100 else line
        print(f"{Colors.GRAY}[{time_str}]{Colors.ENDC} {Colors.FAIL}ERROR:{Colors.ENDC} {Colors.GRAY}{error_snippet}{Colors.ENDC}")
        return True
    
    # Check for warnings
    if 'WRN' in line or 'warning' in line.lower():
        warning_snippet = line[:100] + "..." if len(line) > 100 else line
        print(f"{Colors.GRAY}[{time_str}]{Colors.ENDC} {Colors.WARNING}WARN:{Colors.ENDC} {Colors.GRAY}{warning_snippet}{Colors.ENDC}")
        return True
    
    return False

def monitor_logs():
    """Monitor container logs in real-time"""
    try:
        # Start following logs
        process = subprocess.Popen(
            ['docker', 'logs', '-f', '--tail', '0', 'cloudflared-tunnel'],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )
        
        for line in process.stdout:
            line = line.strip()
            if line:
                parse_log_line(line)
                
    except FileNotFoundError:
        print(f"{Colors.FAIL}Error: Docker command not found. Is Docker installed?{Colors.ENDC}")
        sys.exit(1)
    except KeyboardInterrupt:
        print(f"\n\n{Colors.GRAY}Monitoring stopped{Colors.ENDC}\n")
        process.terminate()
        sys.exit(0)
    except Exception as e:
        print(f"{Colors.FAIL}Error: {e}{Colors.ENDC}")
        sys.exit(1)

if __name__ == "__main__":
    print_header()
    monitor_logs()
