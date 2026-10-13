(() => {
  "use strict";

  const LOCAL = "./assets";
  const REMOTE = "https://copy.sh/v86";
  const NETWORK_RELAY = "wss://relay.widgetry.org/";
  const BUILD_ID = "__BUILD_ID__";

  const el = (id) => document.getElementById(id);
  const boot = el("terminal-boot");
  const bootMessage = el("boot-message");
  const bootProgress = el("boot-progress-bar");
  const bootProgressTrack = el("boot-progress");
  const stateLabel = el("terminal-state");
  const runtimeLabel = el("runtime-label");
  const statusDot = el("status-dot");
  const startButton = el("hero-start");
  const startButtonLabel = el("start-label");
  const restartButton = el("restart-button");
  const stopButton = el("stop-button");
  const commandForm = el("command-form");
  const commandInput = el("command-input");
  const commandSubmit = el("command-submit");
  const ctrlCButton = el("ctrl-c-button");
  const ctrlZButton = el("ctrl-z-button");
  const serialConsole = el("serial-console");
  const copyOutputButton = el("copy-output");
  const downloadOutputButton = el("download-output");
  const bootVersion = el("boot-version");
  const runtimeVersion = el("runtime-version");
  const runtimeTorVersion = el("runtime-tor-version");
  const runtimeHolypVersion = el("runtime-holyp-version");
  const networkRefreshButton = el("network-refresh");
  const networkDot = el("network-dot");
  const networkState = el("network-state");
  const networkIp = el("network-ip");
  const networkExitIp = el("network-exit-ip");
  const networkTorVersion = el("network-tor-version");
  const networkRoute = el("network-route");
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
  let commandHistory = [];
  let commandHistoryIndex = -1;
  let networkMarkerLine = "";
  let networkSetupStarted = false;
  let networkSetupStartedAt = 0;
  let networkSetupTimer = null;
  let networkStatusTimer = null;
  let shellPromptVisible = false;
  let shellPromptExpected = false;
  let terminalLineBuffer = "";

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4200);
  }

  function setProgress(value, message) {
    bootProgressTrack.hidden = false;
    bootProgress.style.width = `${Math.max(0, Math.min(100, value))}%`;
    if (message) bootMessage.textContent = message;
  }

  function setRuntimeState(state, message) {
    stateLabel.textContent = state;
    runtimeLabel.textContent = message;
  }

  function resetNetworkStatus() {
    networkDot.classList.remove("is-live", "is-warning");
    networkState.textContent = "bekliyor";
    networkIp.textContent = "—";
    networkExitIp.textContent = "—";
    networkTorVersion.textContent = runtimeTorVersion.textContent || "—";
    networkRoute.textContent = "—";
  }

  function applyNetworkStatus(ip, torState, torVersion, exitIp, routeState) {
    const isReady = torState === "ready" && routeState === "active";
    const isWarmingUp = networkSetupStarted && Date.now() - networkSetupStartedAt < 90000
      && torState === "stopped" && (ip === "unknown" || routeState === "inactive");
    const isStarting = torState === "starting" || isWarmingUp;
    networkDot.classList.toggle("is-live", isReady);
    networkDot.classList.toggle("is-warning", isStarting);
    networkState.textContent = isReady ? "Tor + rota etkin" : isStarting ? "Tor bağlanıyor" : torState === "ready" ? "Tor etkin · rota bekliyor" : "Tor kapalı";
    networkIp.textContent = isWarmingUp && ip === "unknown" ? "alınıyor" : ip || "bilinmiyor";
    networkExitIp.textContent = exitIp && exitIp !== "pending" ? exitIp : "bekliyor";
    networkTorVersion.textContent = torVersion || runtimeTorVersion.textContent || "bilinmiyor";
    networkRoute.textContent = routeState === "active" ? "şeffaf TCP/DNS" : isWarmingUp ? "ağ hazırlanıyor" : "etkin değil";
    if (isReady) {
      window.clearTimeout(networkStatusTimer);
      setRuntimeState("çalışıyor", "Alpine aktif · Tor yönlendirmesi etkin");
    }
  }

  function setRunningState(running) {
    statusDot.classList.toggle("is-live", running);
    restartButton.disabled = !running;
    stopButton.disabled = !running;
    commandInput.disabled = !running;
    commandSubmit.disabled = !running;
    ctrlCButton.disabled = !running;
    ctrlZButton.disabled = !running;
    networkRefreshButton.disabled = !running;
    startButton.disabled = running || isStarting || Boolean(emulator && !shellReady);
    startButtonLabel.textContent = isStarting ? "Başlatılıyor…" : running ? "Terminal açık" : emulator && shellReady ? "Devam et" : emulator ? "Alpine başlatılıyor…" : "Alpine'ı başlat";
  }

  function updateOutputActions() {
    const hasOutput = Boolean(serialOutput);
    copyOutputButton.disabled = !hasOutput;
    downloadOutputButton.disabled = !hasOutput;
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
    updateOutputActions();
    renderSerialOutput();
    consumeNetworkMarker();
  }

  function consumeNetworkMarker() {
    const match = serialOutput.match(/__WEBRUNNER_NET__\|([^\r\n]*)/);
    if (!match) return;
    serialOutput = serialOutput.replace(match[0], "");
    serialBuffer = serialBuffer.replace(match[0], "");
    updateOutputActions();
    renderSerialOutput();
  }

  function consumeNetworkStatusLine(character) {
    if (character !== "\r" && character !== "\n") {
      networkMarkerLine = `${networkMarkerLine}${character}`.slice(-256);
    } else {
      networkMarkerLine = `${networkMarkerLine}${character}`.slice(-256);
    }

    const match = networkMarkerLine.match(/__WEBRUNNER_NET__\|([^|\r\n]*)\|(starting|ready|stopped)\|([^|\r\n]*)\|([^|\r\n]*)\|(active|inactive)/);
    if (!match) return;
    const [, ip, torState, torVersion, exitIp, routeState] = match;
    networkMarkerLine = "";
    applyNetworkStatus(ip, torState, torVersion, exitIp, routeState);
  }

  function handleSerialCharacter(character) {
    serialBuffer = `${serialBuffer}${character}`.slice(-512);
    consumeNetworkStatusLine(character);

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
        if (/[JK]$/.test(serialEscapeBuffer)) {
          serialOutput = "";
          updateOutputActions();
        }
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
    isStarting = false;
    window.clearTimeout(readyTimer);
    toast.classList.remove("is-visible");
    setProgress(100, "terminal hazır — hoş geldiniz");
    boot.classList.add("is-hidden");
    setRuntimeState("çalışıyor", "Alpine aktif · Tor hazırlanıyor");
    setRunningState(true);
    resetNetworkStatus();
    startNetworkSetup();
  }

  async function loadRuntimeMeta() {
    try {
      const response = await fetch("./runtime.json", { cache: "no-store" });
      if (!response.ok) return;
      const meta = await response.json();
      const label = meta.alpine_version || "stable";
      bootVersion.textContent = label;
      runtimeVersion.textContent = `Alpine ${label}`;
      runtimeTorVersion.textContent = meta.tor_version ? `Tor ${meta.tor_version}` : "Tor paketleniyor";
      runtimeHolypVersion.textContent = meta.holyp_version ? `HolyP ${meta.holyp_version}` : "HolyP paketleniyor";
      if (!shellReady) networkTorVersion.textContent = runtimeTorVersion.textContent;
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
    const localPath = `${LOCAL}/${localName}`;
    const versionedLocalPath = BUILD_ID === "__BUILD_ID__" ? localPath : `${localPath}?v=${BUILD_ID}`;
    try {
      const response = await fetch(versionedLocalPath, { method: "HEAD", cache: "no-store" });
      if (response.ok) return versionedLocalPath;
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
      net_device: {
        type: "virtio",
        relay_url: NETWORK_RELAY,
      },
      cmdline: "rw root=host9p rootfstype=9p rootflags=trans=virtio,version=9p2000.L,cache=loose modules=virtio_pci,virtio_net,9p,9pnet_virtio console=ttyS0,115200n8 init=/usr/bin/webrunner-tty tsc=reliable ipv6.disable=1",
      autostart: true,
    });

    emulator.add_listener("emulator-ready", () => {
      setProgress(74, "Alpine başlatılıyor...");
      setRuntimeState("başlıyor", "Alpine boot ediliyor");
    });

    emulator.add_listener("serial0-output-byte", (byte) => {
      const character = String.fromCharCode(byte);
      handleSerialCharacter(character);
      const visibleSerial = serialBuffer.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
      const promptSeen = /(?:~\s*#|localhost:~#|webrunner[^\r\n]*#|(?:^|\n)# )\s*$/.test(visibleSerial);
      if (promptSeen && (!shellReady || shellPromptExpected)) {
        shellPromptVisible = true;
        shellPromptExpected = false;
        terminalLineBuffer = "";
        markShellReady();
      }
    });

    emulator.add_listener("cpu-event-halt", () => {
      window.clearTimeout(networkStatusTimer);
      window.clearTimeout(networkSetupTimer);
      setRuntimeState("durduruldu", "runtime durduruldu");
      setRunningState(false);
    });

    // Only enable input after the guest has actually exposed a shell prompt.
    readyTimer = window.setTimeout(() => {
      if (shellReady) return;
      try { emulator?.stop(); } catch (_) { /* Sonraki denemede temiz runtime kurulur. */ }
      emulator = null;
      isStarting = false;
      setProgress(0, "Açılış tamamlanmadı. Yeniden deneyebilirsiniz.");
      setRuntimeState("bekliyor", "boot tamamlanamadı");
      setRunningState(false);
      showToast("Alpine shell henüz hazır değil. Runtime loglarını kontrol edin.");
    }, 90000);
  }

  async function start() {
    if (isStarting) return;
    if (emulator) {
      emulator.run();
      if (shellReady) {
        boot.classList.add("is-hidden");
        setRuntimeState("çalışıyor", "Alpine aktif");
        setRunningState(true);
        if (!networkSetupStarted) startNetworkSetup();
        else requestNetworkStatus();
      } else {
        setRuntimeState("başlıyor", "Alpine boot ediliyor");
      }
      return;
    }

    isStarting = true;
    shellReady = false;
    serialBuffer = "";
    networkMarkerLine = "";
    serialOutput = "";
    updateOutputActions();
    serialEscapeBuffer = "";
    networkSetupStarted = false;
    networkSetupStartedAt = 0;
    shellPromptVisible = false;
    shellPromptExpected = false;
    terminalLineBuffer = "";
    window.clearTimeout(networkStatusTimer);
    window.clearTimeout(networkSetupTimer);
    commandHistoryIndex = -1;
    serialConsole.value = "";
    resetNetworkStatus();
    window.clearTimeout(readyTimer);
    boot.classList.remove("is-hidden");
    setRuntimeState("yükleniyor", "runtime hazırlanıyor");
    setProgress(4, "Emülatör hazırlanıyor…");
    setRunningState(false);

    try {
      await createEmulator();
    } catch (error) {
      console.error(error);
      try { emulator?.stop(); } catch (_) { /* Kısmi başlatma temizlenemeyebilir. */ }
      emulator = null;
      setProgress(0, "Başlatılamadı. Yeniden deneyebilirsiniz.");
      setRuntimeState("hata", "runtime yüklenemedi");
      showToast("Alpine runtime yüklenemedi. GitHub Actions derlemesinin tamamlandığından emin olun.");
    } finally {
      isStarting = false;
      setRunningState(shellReady);
    }
  }

  function stop() {
    if (!emulator) return;
    window.clearTimeout(readyTimer);
    window.clearTimeout(networkStatusTimer);
    window.clearTimeout(networkSetupTimer);
    emulator.stop();
    boot.classList.remove("is-hidden");
    setProgress(100, "runtime duraklatıldı");
    setRuntimeState("duraklatıldı", "devam etmek için terminali açın");
    resetNetworkStatus();
    networkState.textContent = "terminal duraklatıldı";
    networkRoute.textContent = "duraklatıldı";
    setRunningState(false);
  }

  function restart() {
    if (!emulator) return;
    window.clearTimeout(readyTimer);
    shellReady = false;
    isStarting = true;
    shellPromptVisible = false;
    shellPromptExpected = false;
    terminalLineBuffer = "";
    serialBuffer = "";
    networkMarkerLine = "";
    serialOutput = "";
    updateOutputActions();
    serialEscapeBuffer = "";
    networkSetupStarted = false;
    networkSetupStartedAt = 0;
    window.clearTimeout(networkStatusTimer);
    window.clearTimeout(networkSetupTimer);
    commandHistoryIndex = -1;
    serialConsole.value = "";
    commandInput.value = "";
    resetNetworkStatus();
    setRunningState(false);
    setProgress(25, "Alpine yeniden başlatılıyor...");
    boot.classList.remove("is-hidden");
    setRuntimeState("yeniden başlıyor", "çekirdek resetleniyor");
    emulator.restart();
    readyTimer = window.setTimeout(() => {
      if (shellReady) return;
      try { emulator?.stop(); } catch (_) { /* Sonraki denemede temiz runtime kurulur. */ }
      emulator = null;
      isStarting = false;
      setProgress(0, "Açılış tamamlanmadı. Yeniden deneyebilirsiniz.");
      setRuntimeState("bekliyor", "boot tamamlanamadı");
      setRunningState(false);
      showToast("Alpine yeniden başlatıldı fakat shell hazır olmadı.");
    }, 90000);
  }

  function sendCommand(command) {
    const normalizedCommand = command.trim();
    if (!normalizedCommand) return;
    if (!emulator || !shellReady) {
      showToast(isStarting ? "Alpine açılıyor; terminal hazır olduğunda tekrar deneyin." : "Önce Alpine terminalini başlatın.");
      if (!isStarting) start();
      return;
    }
    if (!shellPromptVisible) {
      showToast("Önce terminalde çalışan komutun tamamlanmasını bekleyin.");
      return;
    }
    shellPromptVisible = false;
    shellPromptExpected = true;
    terminalLineBuffer = "";
    sendSerialInput(`${normalizedCommand}\n`);
    if (commandHistory[commandHistory.length - 1] !== normalizedCommand) commandHistory.push(normalizedCommand);
    commandHistory = commandHistory.slice(-50);
    commandHistoryIndex = -1;
    commandInput.value = "";
  }

  function startNetworkSetup() {
    if (networkSetupStarted) return;
    networkDot.classList.add("is-warning");
    networkState.textContent = "Tor başlıyor";
    const launchWhenIdle = () => {
      if (!shellReady) return;
      if (!shellPromptVisible) {
        networkSetupTimer = window.setTimeout(launchWhenIdle, 1000);
        return;
      }
      networkSetupStarted = true;
      networkSetupStartedAt = Date.now();
      shellPromptVisible = false;
      shellPromptExpected = true;
      sendSerialInput("(ifconfig lo up && ifconfig eth0 up && udhcpc -i eth0 && /usr/bin/webrunner-tor start && /usr/bin/webrunner-tor transparent) </dev/null >/var/log/webrunner-network.log 2>&1 &\n");
      window.setTimeout(requestNetworkStatus, 7000);
    };
    networkSetupTimer = window.setTimeout(launchWhenIdle, 250);
  }

  function requestNetworkStatus() {
    if (!shellReady) return;
    if (!shellPromptVisible) {
      window.clearTimeout(networkStatusTimer);
      networkStatusTimer = window.setTimeout(requestNetworkStatus, 3000);
      return;
    }
    shellPromptVisible = false;
    shellPromptExpected = true;
    sendSerialInput("/usr/bin/webrunner-tor status\n");
    window.clearTimeout(networkStatusTimer);
    // Tor may need several minutes on a cold start to download relay
    // descriptors. Keep refreshing until it becomes ready.
    networkStatusTimer = window.setTimeout(requestNetworkStatus, 22000);
  }

  function sendSerialInput(value) {
    if (!emulator || !shellReady) return false;
    if (typeof emulator.serial0_send === "function") {
      emulator.serial0_send(value);
      return true;
    }
    if (typeof emulator.keyboard_send_text === "function") {
      emulator.keyboard_send_text(value);
      return true;
    }
    return false;
  }

  function sendControlCharacter(character) {
    shellPromptVisible = false;
    shellPromptExpected = true;
    terminalLineBuffer = "";
    if (!sendSerialInput(character)) showToast("Alpine terminali henüz hazır değil.");
    commandInput.focus();
  }

  function sendCtrlC() {
    sendControlCharacter("\u0003");
  }

  function sendCtrlZ() {
    sendControlCharacter("\u001a");
  }

  function sendTerminalKey(event) {
    if (!shellReady) return;
    const specialKeys = {
      Enter: "\r",
      Backspace: "\u007f",
      Tab: "\t",
      Escape: "\u001b",
      ArrowUp: "\u001b[A",
      ArrowDown: "\u001b[B",
      ArrowRight: "\u001b[C",
      ArrowLeft: "\u001b[D",
      Home: "\u001b[H",
      End: "\u001b[F",
      Delete: "\u001b[3~",
    };
    let value = specialKeys[event.key] || "";
    if (event.ctrlKey && !event.altKey && !event.metaKey) {
      const controlKeys = { c: "\u0003", d: "\u0004", l: "\u000c", z: "\u001a" };
      value = controlKeys[event.key.toLowerCase()] || value;
    } else if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key.length === 1) {
      value = event.key;
    }
    if (!value) return;
    event.preventDefault();
    const controlKey = event.ctrlKey && ["c", "d", "z"].includes(event.key.toLowerCase());
    if (event.key === "Enter" || controlKey) {
      shellPromptVisible = false;
      shellPromptExpected = true;
      terminalLineBuffer = "";
    } else if (event.ctrlKey && event.key.toLowerCase() === "u") {
      terminalLineBuffer = "";
      shellPromptVisible = true;
    } else if (event.key === "Backspace") {
      terminalLineBuffer = terminalLineBuffer.slice(0, -1);
      if (!terminalLineBuffer) shellPromptVisible = true;
    } else if (["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "Delete"].includes(event.key)) {
      terminalLineBuffer = terminalLineBuffer || " ";
      shellPromptVisible = false;
    } else if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key.length === 1) {
      terminalLineBuffer += event.key;
      shellPromptVisible = false;
    }
    sendSerialInput(value);
  }

  async function copyOutput() {
    if (!serialOutput) return;
    try {
      await navigator.clipboard.writeText(serialOutput);
      showToast("Terminal çıktısı kopyalandı.");
    } catch (_) {
      serialConsole.focus();
      serialConsole.select();
      document.execCommand("copy");
      showToast("Terminal çıktısı kopyalandı.");
    }
  }

  function downloadOutput() {
    if (!serialOutput) return;
    const blob = new Blob([serialOutput], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "webrunner-terminal.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  startButton.addEventListener("click", start);
  restartButton.addEventListener("click", restart);
  stopButton.addEventListener("click", stop);
  ctrlCButton.addEventListener("click", sendCtrlC);
  ctrlZButton.addEventListener("click", sendCtrlZ);
  networkRefreshButton.addEventListener("click", () => {
    if (!shellPromptVisible) {
      showToast("Ağ bilgisi, terminal komutu tamamlanınca güncellenecek.");
      return;
    }
    requestNetworkStatus();
  });
  serialConsole.addEventListener("keydown", sendTerminalKey);
  copyOutputButton.addEventListener("click", copyOutput);
  downloadOutputButton.addEventListener("click", downloadOutput);
  commandForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendCommand(commandInput.value);
    commandInput.focus();
  });

  commandInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" && commandHistory.length) {
      event.preventDefault();
      commandHistoryIndex = Math.min(commandHistoryIndex + 1, commandHistory.length - 1);
      commandInput.value = commandHistory[commandHistory.length - 1 - commandHistoryIndex];
      commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length);
    } else if (event.key === "ArrowDown" && commandHistoryIndex >= 0) {
      event.preventDefault();
      commandHistoryIndex -= 1;
      commandInput.value = commandHistoryIndex < 0 ? "" : commandHistory[commandHistory.length - 1 - commandHistoryIndex];
      commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length);
    } else if (event.key === "Escape") {
      commandInput.value = "";
      commandHistoryIndex = -1;
    }
  });

  // Runtime is large; wait until the user explicitly asks to start it.
  loadRuntimeMeta();
})();
