(() => {
  "use strict";

  const LOCAL = "./assets";
  const REMOTE = "https://copy.sh/v86";

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
  const commandForm = el("command-form");
  const commandInput = el("command-input");
  const commandSubmit = el("command-submit");
  const serialConsole = el("serial-console");
  const bootVersion = el("boot-version");
  const runtimeVersion = el("runtime-version");
  const toast = el("toast");

  let emulator = null;
  let isStarting = false;
  let shellReady = false;
  let readyTimer = null;
  let serialBuffer = "";
  let serialOutput = "";
  let serialEscapeBuffer = "";
  let serialRenderScheduled = false;
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
    commandInput.disabled = !running;
    commandSubmit.disabled = !running;
    startButton.disabled = running || isStarting;
  }

  function renderSerialOutput() {
    if (serialRenderScheduled) return;
    serialRenderScheduled = true;
    window.requestAnimationFrame(() => {
      serialConsole.value = serialOutput;
      serialConsole.scrollTop = serialConsole.scrollHeight;
      serialRenderScheduled = false;
    });
  }

  function appendSerialCharacter(character) {
    serialOutput = `${serialOutput}${character}`.slice(-24000);
    renderSerialOutput();
  }

  function handleSerialCharacter(character) {
    serialBuffer = `${serialBuffer}${character}`.slice(-512);

    if (serialEscapeBuffer) {
      serialEscapeBuffer += character;

      // ash/readline asks the terminal for the cursor position. Respond as
      // a terminal would, but do not print the control sequence to the page.
      if (serialEscapeBuffer === "\u001b[6n") {
        if (typeof emulator?.serial0_send === "function") emulator.serial0_send("\u001b[1;1R");
        serialEscapeBuffer = "";
        return;
      }

      // Consume CSI escape sequences. A textarea cannot render them, while
      // clear-screen commands should still clear the visible transcript.
      if (serialEscapeBuffer.startsWith("\u001b[") && /[A-Za-z@`~]$/.test(serialEscapeBuffer)) {
        if (/[JK]$/.test(serialEscapeBuffer)) serialOutput = "";
        serialEscapeBuffer = "";
        renderSerialOutput();
        return;
      }

      if (serialEscapeBuffer.length >= 24) {
        serialEscapeBuffer = "";
      }
      return;
    }

    if (character === "\u001b") {
      serialEscapeBuffer = character;
      return;
    }

    appendSerialCharacter(character);
  }

  function markShellReady() {
    if (shellReady) return;
    shellReady = true;
    window.clearTimeout(readyTimer);
    setProgress(100, "terminal hazır — hoş geldiniz");
    boot.classList.add("is-hidden");
    setRuntimeState("çalışıyor", "Alpine aktif");
    setRunningState(true);
  }

  async function loadRuntimeMeta() {
    try {
      const response = await fetch("./runtime.json", { cache: "no-store" });
      if (!response.ok) return;
      const meta = await response.json();
      const label = meta.alpine_version || "stable";
      bootVersion.textContent = label;
      runtimeVersion.textContent = `Alpine ${label}`;
    } catch (_) {
      // Local source preview may not have the generated runtime metadata yet.
    }
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
    if (remoteUrl) return remoteUrl;
    throw new Error(`Eksik runtime varlığı: ${localName}`);
  }

  async function createEmulator() {
    setProgress(14, "v86 runtime yükleniyor...");
    await loadScript(`${LOCAL}/libv86.js`).catch(() => loadScript(`${REMOTE}/build/libv86.js`));

    const [wasm, bios, vgaBios, kernel, initrd, filesystemIndex] = await Promise.all([
      assetUrl("v86.wasm", `${REMOTE}/build/v86.wasm`),
      assetUrl("seabios.bin", `${REMOTE}/bios/seabios.bin`),
      assetUrl("vgabios.bin", `${REMOTE}/bios/vgabios.bin`),
      assetUrl("vmlinuz-virt", null),
      assetUrl("initramfs-virt", null),
      assetUrl("alpine-fs.json", null),
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
      filesystem: {
        baseurl: `${LOCAL}/alpine-rootfs-flat`,
        basefs: filesystemIndex,
      },
      bzimage_initrd_from_filesystem: false,
      cmdline: "rw root=host9p rootfstype=9p rootflags=trans=virtio,version=9p2000.L,cache=loose modules=virtio_pci,9p,9pnet_virtio console=ttyS0,115200n8 init=/bin/sh tsc=reliable",
      autostart: true,
    });

    emulator.add_listener("emulator-ready", () => {
      setProgress(74, "Alpine başlatılıyor...");
      setRuntimeState("başlıyor", "Alpine boot ediliyor");
    });

    emulator.add_listener("serial0-output-byte", (byte) => {
      const character = String.fromCharCode(byte);
      handleSerialCharacter(character);
      if (/(?:~\s*#|localhost:~#|webrunner.*#|(?:^|\n)# )/.test(serialBuffer)) markShellReady();
    });

    emulator.add_listener("cpu-event-halt", () => {
      setRuntimeState("durduruldu", "runtime durduruldu");
      setRunningState(false);
    });

    // Only enable input after the guest has actually exposed a shell prompt.
    readyTimer = window.setTimeout(() => {
      if (shellReady) return;
      setProgress(0, "Alpine shell bekleniyor...");
      setRuntimeState("bekliyor", "boot tamamlanamadı");
      showToast("Alpine shell henüz hazır değil. Runtime loglarını kontrol edin.");
    }, 30000);
  }

  async function start() {
    if (isStarting) return;
    if (emulator) {
      emulator.run();
      if (shellReady) {
        boot.classList.add("is-hidden");
        setRuntimeState("çalışıyor", "Alpine aktif");
        setRunningState(true);
      } else {
        setRuntimeState("başlıyor", "Alpine boot ediliyor");
      }
      return;
    }

    isStarting = true;
    shellReady = false;
    serialBuffer = "";
    serialOutput = "";
    serialEscapeBuffer = "";
    serialConsole.value = "";
    window.clearTimeout(readyTimer);
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
    window.clearTimeout(readyTimer);
    emulator.stop();
    boot.classList.remove("is-hidden");
    setProgress(100, "runtime duraklatıldı");
    setRuntimeState("duraklatıldı", "devam etmek için terminali açın");
    setRunningState(false);
  }

  function restart() {
    if (!emulator) return;
    window.clearTimeout(readyTimer);
    shellReady = false;
    serialBuffer = "";
    serialOutput = "";
    serialEscapeBuffer = "";
    serialConsole.value = "";
    commandInput.value = "";
    setRunningState(false);
    setProgress(25, "Alpine yeniden başlatılıyor...");
    boot.classList.remove("is-hidden");
    setRuntimeState("yeniden başlıyor", "çekirdek resetleniyor");
    emulator.restart();
    readyTimer = window.setTimeout(() => {
      if (shellReady) return;
      setProgress(0, "Alpine shell bekleniyor...");
      setRuntimeState("bekliyor", "boot tamamlanamadı");
      showToast("Alpine yeniden başlatıldı fakat shell hazır olmadı.");
    }, 30000);
  }

  function sendCommand(command) {
    const normalizedCommand = command.trim();
    if (!normalizedCommand) return;
    if (!emulator) {
      showToast(isStarting ? "Alpine açılıyor; terminal hazır olduğunda tekrar deneyin." : "Önce Alpine terminalini başlatın.");
      if (!isStarting) start();
      return;
    }
    if (typeof emulator.serial0_send === "function") {
      emulator.serial0_send(`${normalizedCommand}\n`);
    } else if (typeof emulator.keyboard_send_text === "function") {
      emulator.keyboard_send_text(`${normalizedCommand}\n`);
    }
    commandInput.value = "";
  }

  startButton.addEventListener("click", start);
  restartButton.addEventListener("click", restart);
  stopButton.addEventListener("click", stop);
  commandForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendCommand(commandInput.value);
    commandInput.focus();
  });

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => sendCommand(button.dataset.command));
  });

  // Sayfa açıldığında terminali otomatik olarak yükle; kullanıcı düşük hareket
  // tercih ediyorsa aynı davranış korunur çünkü bu bir ekran geçişi değil runtime boot'udur.
  loadRuntimeMeta();
  window.setTimeout(start, 650);
})();
