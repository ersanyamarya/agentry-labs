# Runs argv under a pseudo-terminal (100x40), sends "q" once the tab counts show (`Skills 3`: the data has loaded) and the screen has been quiet for 0.3 s (30 s cap
# so a busy machine does not cut the run short), writes everything the program printed to stdout.
import os, pty, re, select, struct, fcntl, termios, sys, time
pid, fd = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 100, 0, 0))
LOADED = re.compile(rb"Skills\s\d")
out, sent, start, last = b"", False, time.time(), time.time()
while time.time() - start < 30:
    if not sent and LOADED.search(out) and time.time() - last > 0.3:
        os.write(fd, b"q"); sent = True
    r, _, _ = select.select([fd], [], [], 0.1)
    if r:
        try:
            d = os.read(fd, 65536)
        except OSError:
            break
        if not d:
            break
        out += d
        last = time.time()
sys.stdout.buffer.write(out)
