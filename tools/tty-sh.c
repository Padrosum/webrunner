#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <unistd.h>

static void fail(const char *message) {
  dprintf(STDERR_FILENO, "webrunner-tty: %s: %s\n", message, strerror(errno));
  _exit(1);
}

int main(void) {
  int tty = open("/dev/ttyS0", O_RDWR | O_NOCTTY);
  if (tty < 0) fail("tty açılamadı");

  if (setsid() < 0 && errno != EPERM) fail("yeni oturum açılamadı");
  if (ioctl(tty, TIOCSCTTY, 1) < 0 && errno != EPERM) fail("kontrol terminali atanamadı");

  if (dup2(tty, STDIN_FILENO) < 0 ||
      dup2(tty, STDOUT_FILENO) < 0 ||
      dup2(tty, STDERR_FILENO) < 0) {
    fail("standart akışlar bağlanamadı");
  }
  if (tty > STDERR_FILENO) close(tty);

  execl("/bin/sh", "sh", "-i", (char *)NULL);
  fail("shell başlatılamadı");
  return 1;
}
