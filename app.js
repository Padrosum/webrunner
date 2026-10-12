(() => {
  "use strict";

  const LOCAL = "./assets";
  const REMOTE = "https://copy.sh/v86";
  const ALPINE_REMOTE = "https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86/netboot";

  const el = (id) => document.getElementById(id);
  const boot = el("terminal-boot");
  const bootMessage = el("boot-message");
  const bootProgress = el("boot-progress-bar");
  const stateLabel = el("terminal-state");
  const runtimeLabel = el("runtime-label");
  const statusDot = el("status-dot");
  const emptyState = el("terminal-empty");
  const startButton = el("hero-start");
  const restartButton = el("restart-button");
  const stopButton = el("stop-button");
  const toast = el("toast");

  let emulator = null;
  let isStarting = false;
  let toastTimer = null;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4200);
  }

  function setProgress(value, message) {
    bootProgress.style.width = `${Math.max(0, Math.min(100, value))}%`;
    if (message) bootMessage.textContent = message;
  }

  function setRuntimeState(state, message) {
    stateLabel.textContent = state;
    runtimeLabel.textContent = message;
  }

  function setRunningState(running) {
    statusDot.classList.toggle("is-live", running);
    restartButton.disabled = !running;
    stopButton.disabled = !running;
    startButton.disabled = running || isStarting;
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      if (window.V86 || window.V86Starter) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`v86 yüklenemedi: ${url}`));
      document.head.appendChild(script);
    });
  }

  async function assetUrl(localName, remoteUrl) {
    try {
      const response = await fetch(`${LOCAL}/${localName}`, { method: "HEAD", cache: "no-store" });
      if (response.ok) return `${LOCAL}/${localName}`;
    } catch (_) {
      // file:// ile açılan yerel önizlemelerde HEAD çalışmayabilir; uzak yola geçilir.
    }
    return remoteUrl;
  }

  async function createEmulator() {
    setProgress(14, "v86 runtime yükleniyor...");
    await loadScript(`${LOCAL}/libv86.js`).catch(() => loadScript(`${REMOTE}/build/libv86.js`));

    const [wasm, bios, vgaBios, kernel, initrd] = await Promise.all([
      assetUrl("v86.wasm", `${REMOTE}/build/v86.wasm`),
      assetUrl("seabios.bin", `${REMOTE}/bios/seabios.bin`),
      assetUrl("vgabios.bin", `${REMOTE}/bios/vgabios.bin`),
      assetUrl("vmlinuz-lts", `${ALPINE_REMOTE}/vmlinuz-lts`),
      assetUrl("initramfs-lts", `${ALPINE_REMOTE}/initramfs-lts`),
    ]);

    setProgress(38, "Alpine çekirdeği yükleniyor...");

    const Emulator = window.V86 || window.V86Starter;
    if (!Emulator) throw new Error("v86 constructor bulunamadı");

    emulator = new Emulator({
      wasm_path: wasm,
      memory_size: 512 * 1024 * 1024,
      vga_memory_size: 8 * 1024 * 1024,
      screen_container: el("screen_container"),
      bios: { url: bios },
      vga_bios: { url: vgaBios },
      bzimage: { url: kernel, async: false },
      initrd: { url: initrd, async: false },
      cmdline: "console=tty0 console=ttyS0,115200n8 modules=virtio_pci,virtio_blk,9p,9pnet_virtio,virtio_net tsc=reliable",
      autostart: true,
    });

    emulator.add_listener("emulator-ready", () => {
      setProgress(74, "Alpine başlatılıyor...");
      setRuntimeState("başlıyor", "Alpine boot ediliyor");
    });

    emulator.add_listener("cpu-event-halt", () => {
      setRuntimeState("durduruldu", "runtime durduruldu");
      setRunningState(false);
    });

    // Alpine'ın açılış süresi donanıma göre değişir; gerçek shell görünene kadar
    // kullanıcıya bir durum akışı göstermek için hafif bir zamanlayıcı kullanılır.
    window.setTimeout(() => {
      setProgress(100, "terminal hazır — hoş geldiniz");
      boot.classList.add("is-hidden");
      setRuntimeState("çalışıyor", "Alpine aktif");
      setRunningState(true);
    }, 6200);
  }

  async function start() {
    if (isStarting) return;
    if (emulator) {
      emulator.run();
      boot.classList.add("is-hidden");
      setRuntimeState("çalışıyor", "Alpine aktif");
      setRunningState(true);
      return;
    }

    isStarting = true;
    emptyState.hidden = true;
    boot.classList.remove("is-hidden");
    setRuntimeState("yükleniyor", "runtime hazırlanıyor");
    startButton.disabled = true;

    try {
      await createEmulator();
    } catch (error) {
      console.error(error);
      setProgress(0, "yükleme başarısız");
      setRuntimeState("hata", "runtime yüklenemedi");
      showToast("Alpine runtime yüklenemedi. GitHub Actions derlemesinin tamamlandığından emin olun.");
      startButton.disabled = false;
      emptyState.hidden = false;
    } finally {
      isStarting = false;
    }
  }

  function stop() {
    if (!emulator) return;
    emulator.stop();
    boot.classList.remove("is-hidden");
    setProgress(100, "runtime duraklatıldı");
    setRuntimeState("duraklatıldı", "devam etmek için terminali açın");
    setRunningState(false);
  }

  function restart() {
    if (!emulator) return;
    setProgress(25, "Alpine yeniden başlatılıyor...");
    boot.classList.remove("is-hidden");
    setRuntimeState("yeniden başlıyor", "çekirdek resetleniyor");
    emulator.restart();
    window.setTimeout(() => {
      setProgress(100, "terminal hazır — hoş geldiniz");
      boot.classList.add("is-hidden");
      setRuntimeState("çalışıyor", "Alpine aktif");
      setRunningState(true);
    }, 5200);
  }

  function sendCommand(command) {
    if (!emulator) {
      showToast("Önce Alpine terminalini başlatın.");
      start();
      return;
    }
    if (typeof emulator.keyboard_send_text === "function") {
      emulator.keyboard_send_text(`${command}\n`);
    } else if (typeof emulator.serial0_send === "function") {
      emulator.serial0_send(`${command}\n`);
    }
  }

  startButton.addEventListener("click", start);
  restartButton.addEventListener("click", restart);
  stopButton.addEventListener("click", stop);

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => sendCommand(button.dataset.command));
  });

  // Sayfa açıldığında terminali otomatik olarak yükle; kullanıcı düşük hareket
  // tercih ediyorsa aynı davranış korunur çünkü bu bir ekran geçişi değil runtime boot'udur.
  window.setTimeout(start, 650);
})();
