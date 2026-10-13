#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <unistd.h>

static void fail(const char *message) {
  dprintf(STDERR_FILENO, "webrunner-tty: %s: %s\n", message, strerror(errno));
  _exit(1);
}

static void run_shell(void) {
  int tty = open("/dev/ttyS0", O_RDWR | O_NOCTTY);
  if (tty < 0) fail("tty açılamadı");

  // The browser boot path intentionally skips OpenRC, so mdev may leave the
  // Keep the basic devices usable when the browser boot path skips OpenRC.
  chmod("/dev/null", 0666);
  chmod("/dev/zero", 0666);
  chmod("/dev/random", 0666);
  chmod("/dev/urandom", 0666);

  if (setsid() < 0) fail("yeni oturum açılamadı");
  if (ioctl(tty, TIOCSCTTY, 1) < 0 && errno != EPERM) fail("kontrol terminali atanamadı");

  if (dup2(tty, STDIN_FILENO) < 0 ||
      dup2(tty, STDOUT_FILENO) < 0 ||
      dup2(tty, STDERR_FILENO) < 0) {
    fail("standart akışlar bağlanamadı");
  }
  if (tty > STDERR_FILENO) close(tty);

  execl("/bin/sh", "sh", "-i", (char *)NULL);
  fail("shell başlatılamadı");
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--version") == 0) {
    puts("WebRunner tty helper 2");
    return 0;
  }

  // PID 1 cannot create a new session because it is already a process-group
  // leader. Run the interactive shell as a child so it can own the tty's
  // foreground process group; this makes job-control keys such as Ctrl+Z
  // generate SIGTSTP for foreground commands as expected.
  if (getpid() != 1) {
    run_shell();
    return 1;
  }

  for (;;) {
    pid_t shell = fork();
    if (shell == 0) {
      run_shell();
      _exit(1);
    }
    if (shell < 0) {
      sleep(1);
      continue;
    }

    int status;
    while (waitpid(shell, &status, 0) < 0 && errno == EINTR) {
    }
  }
}
