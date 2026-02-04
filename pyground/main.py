
import os
import time

WATCH_FILE = os.path.join(os.path.dirname(__file__), "display.py")

def handle(content: str):
  try:
    print()
    ns = {}
    exec(content, ns)
  except Exception as e:
    print(str(e))

def watch_display():
    last_mtime = 0
    print(f"Watching {WATCH_FILE} for changes...")
    while True:
        try:
            mtime = os.path.getmtime(WATCH_FILE)
            if mtime > last_mtime:
                with open(WATCH_FILE) as f:
                    content = f.read()
                os.system('cls' if os.name == 'nt' else 'clear')
                handle(content)
                last_mtime = mtime
        except FileNotFoundError:
            pass
        time.sleep(0.1)

if __name__ == "__main__": watch_display()
