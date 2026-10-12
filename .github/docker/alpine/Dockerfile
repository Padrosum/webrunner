FROM i386/alpine:latest

ENV KERNEL=virt

RUN apk add --no-cache \
      openrc \
      alpine-base \
      alpine-conf \
      agetty \
      linux-${KERNEL} \
      linux-firmware-none

# Start an autologin shell on both the emulated VGA terminal and serial port.
RUN sed -i 's/getty 38400 tty1/agetty --autologin root tty1 linux/' /etc/inittab \
 && printf '%s\n' 'ttyS0::respawn:/sbin/agetty --autologin root ttyS0 vt100' >> /etc/inittab \
 && echo 'root:' | chpasswd \
 && echo 'localhost' > /etc/hostname \
 && setup-hostname localhost \
 && printf '%s\n' \
      '#!/bin/sh' \
      'export TERM=vt100' \
      'export PS1="(webrunner):\\w# "' \
      'exec /bin/ash -i' \
    > /sbin/webrunner-init \
 && chmod +x /sbin/webrunner-init

RUN printf '%s\n' \
      'rmmod ne2k-pci && modprobe ne2k-pci' \
      'rmmod virtio-net && modprobe virtio-net' \
      'hwclock -s' \
      'setup-interfaces -a -r' \
 > /root/networking.sh \
 && chmod +x /root/networking.sh

RUN for service in devfs dmesg mdev hwdrivers; do rc-update add "$service" sysinit; done \
 && for service in hwclock modules sysctl hostname syslog bootmisc; do rc-update add "$service" boot; done \
 && rc-update add killprocs shutdown

# The browser mounts the exported container filesystem over v86's 9p device.
RUN mkinitfs -F "base virtio 9p" "$(cat /usr/share/kernel/${KERNEL}/kernel.release)"

RUN rm -rf /var/cache/apk/* /tmp/*
