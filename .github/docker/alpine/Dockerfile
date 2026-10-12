FROM i386/alpine:latest

ENV KERNEL=virt

RUN apk add --no-cache \
      openrc \
      alpine-base \
      alpine-conf \
      linux-${KERNEL} \
      linux-firmware-none

RUN echo 'root:' | chpasswd \
 && echo 'localhost' > /etc/hostname \
 && setup-hostname localhost

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
