#include "Prelude.HC"

U8 *versions = FileRead("/etc/webrunner-versions");
U8 *config = FileRead("/etc/tor/torrc");

Print("=== WebRunner / HolyC Tor bilgisi ===\n");
Print("\n[sürümler]\n");
if (versions)
  Print("%s", versions);
else
  Print("/etc/webrunner-versions okunamadı\n");

Print("\n[yerel Tor uçları]\n");
if (config)
  Print("%s", config);
else
  Print("/etc/tor/torrc okunamadı\n");
