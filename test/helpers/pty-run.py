# Runs argv under a pseudo-terminal (100x40), sends "q" after 2 seconds, writes everything the program printed to stdout.
import os, pty, select, struct, fcntl, termios, sys, time
pid, fd = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 100, 0, 0))
out, sent, start = b"", False, time.time()
while time.time() - start < 8:
    if not sent and time.time() - start > 2:
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
sys.stdout.buffer.write(out)
