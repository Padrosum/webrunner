FROM i386/alpine:latest AS holyp-build

RUN apk add --no-cache cargo rust
COPY .github/docker/alpine/holyp-src /tmp/holyp
WORKDIR /tmp/holyp
RUN cargo build --release

FROM i386/alpine:latest

ENV KERNEL=virt

RUN apk add --no-cache \
      openrc \
      alpine-base \
      alpine-conf \
      linux-${KERNEL} \
      linux-firmware-none \
      ca-certificates \
      curl \
      iptables \
      tor \
      torsocks \
      w3m

COPY --from=holyp-build /tmp/holyp/target/release/holyp /usr/local/bin/holyp
COPY tools/webrunner-tor /usr/local/bin/webrunner-tor
COPY tools/tft /usr/local/bin/tft
COPY tools/torrc /etc/tor/torrc
COPY tools/holyc /usr/share/webrunner/holyc
COPY tools/THIRD_PARTY_NOTICES.md /usr/share/doc/webrunner/THIRD_PARTY_NOTICES.md

RUN for tool in net-info tor-info about; do \
      printf '%s\n' '#!/bin/sh' "exec /usr/local/bin/holyp /usr/share/webrunner/holyc/$tool.HC \"\$@\"" > "/usr/local/bin/hc-$tool"; \
    done \
 && chmod +x /usr/local/bin/holyp /usr/local/bin/webrunner-tor /usr/local/bin/tft /usr/local/bin/hc-* \
 && mkdir -p /run/tor /var/log/tor /var/lib/tor \
 && chown -R tor:tor /run/tor /var/log/tor /var/lib/tor \
 && tor --verify-config -f /etc/tor/torrc \
 && printf '%s\n' \
      "alpine=$(cat /etc/alpine-release)" \
      "tor=$(tor --version | sed -n 's/^Tor version //p')" \
      "holyp=$(holyp -V | sed -n 's/^holyp //p')" \
 > /etc/webrunner-versions

RUN echo 'root:' | chpasswd \
 && echo 'localhost' > /etc/hostname \
 && setup-hostname localhost \
 && printf '%s\n' \
      'auto lo' \
      'iface lo inet loopback' \
      '' \
      'auto eth0' \
      'iface eth0 inet dhcp' \
 > /etc/network/interfaces

RUN printf '%s\n' \
      'modprobe virtio_net 2>/dev/null || true' \
      'hwclock -s' \
      'ifconfig eth0 up && udhcpc -i eth0' \
 > /root/networking.sh \
 && chmod +x /root/networking.sh

RUN for service in devfs dmesg mdev hwdrivers; do rc-update add "$service" sysinit; done \
 && for service in hwclock modules sysctl hostname syslog bootmisc; do rc-update add "$service" boot; done \
 && rc-update add killprocs shutdown

# The browser mounts the exported container filesystem over v86's 9p device.
RUN mkinitfs -F "base virtio 9p" "$(cat /usr/share/kernel/${KERNEL}/kernel.release)"

RUN rm -rf /var/cache/apk/* /tmp/*
