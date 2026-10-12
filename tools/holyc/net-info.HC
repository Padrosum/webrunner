#include "Prelude.HC"

U8 *devices = FileRead("/proc/net/dev");
U8 *routes = FileRead("/proc/net/route");
U8 *dns = FileRead("/etc/resolv.conf");

Print("=== WebRunner / HolyC ağ bilgisi ===\n");
Print("\n[arayüzler]\n");
if (devices)
  Print("%s", devices);
else
  Print("/proc/net/dev okunamadı\n");

Print("\n[rotalar]\n");
if (routes)
  Print("%s", routes);
else
  Print("/proc/net/route okunamadı\n");

Print("\n[DNS]\n");
if (dns)
  Print("%s", dns);
else
  Print("/etc/resolv.conf okunamadı\n");
