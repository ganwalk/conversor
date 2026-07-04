/* Conversor de áudio no navegador, usando ffmpeg.wasm (single-thread).
 * Nenhum arquivo sai do dispositivo do usuário. */
(() => {
  "use strict";

  const { FFmpeg } = FFmpegWASM;
  const { fetchFile } = FFmpegUtil;

  // Formatos de saída suportados. "args" gera os parâmetros do ffmpeg
  // para a qualidade escolhida; formatos sem perda não têm qualidades.
  const FORMATS = {
    mp3: {
      label: "MP3",
      ext: "mp3",
      mime: "audio/mpeg",
      qualities: [
        { value: "128k", label: "128 kbps (leve)" },
        { value: "192k", label: "192 kbps (recomendado)" },
        { value: "256k", label: "256 kbps (ótima)" },
        { value: "320k", label: "320 kbps (máxima)" },
      ],
      defaultQuality: "192k",
      args: (q) => ["-c:a", "libmp3lame", "-b:a", q],
    },
    m4a: {
      label: "M4A (AAC)",
      ext: "m4a",
      mime: "audio/mp4",
      qualities: [
        { value: "128k", label: "128 kbps (leve)" },
        { value: "192k", label: "192 kbps (recomendado)" },
        { value: "256k", label: "256 kbps (ótima)" },
      ],
      defaultQuality: "192k",
      args: (q) => ["-c:a", "aac", "-b:a", q],
    },
    ogg: {
      label: "OGG (Vorbis)",
      ext: "ogg",
      mime: "audio/ogg",
      qualities: [
        { value: "3", label: "Qualidade média (~112 kbps)" },
        { value: "5", label: "Qualidade boa (~160 kbps)" },
        { value: "7", label: "Qualidade ótima (~224 kbps)" },
      ],
      defaultQuality: "5",
      args: (q) => ["-c:a", "libvorbis", "-q:a", q],
    },
    opus: {
      label: "OPUS",
      ext: "opus",
      mime: "audio/opus",
      qualities: [
        { value: "64k", label: "64 kbps (voz)" },
        { value: "96k", label: "96 kbps (boa)" },
        { value: "128k", label: "128 kbps (recomendado)" },
        { value: "192k", label: "192 kbps (máxima)" },
      ],
      defaultQuality: "128k",
      args: (q) => ["-c:a", "libopus", "-b:a", q],
    },
    flac: {
      label: "FLAC (sem perdas)",
      ext: "flac",
      mime: "audio/flac",
      args: () => ["-c:a", "flac"],
    },
    wav: {
      label: "WAV (sem compressão)",
      ext: "wav",
      mime: "audio/wav",
      args: () => ["-c:a", "pcm_s16le"],
    },
    aiff: {
      label: "AIFF (sem compressão)",
      ext: "aiff",
      mime: "audio/aiff",
      args: () => ["-c:a", "pcm_s16be"],
    },
  };

  // ---------- Estado ----------
  /** @type {{id:number, file:File, status:string, result?:{blob:Blob, name:string}, el?:HTMLElement}[]} */
  let items = [];
  let nextId = 1;
  let ffmpeg = null;
  let converting = false;

  // ---------- Elementos ----------
  const $ = (id) => document.getElementById(id);
  const dropzone = $("dropzone");
  const fileInput = $("fileInput");
  const optionsBox = $("options");
  const formatSelect = $("formatSelect");
  const qualityGroup = $("qualityGroup");
  const qualitySelect = $("qualitySelect");
  const convertBtn = $("convertBtn");
  const clearBtn = $("clearBtn");
  const engineStatus = $("engineStatus");
  const fileList = $("fileList");
  const downloadAllWrap = $("downloadAllWrap");
  const downloadAllBtn = $("downloadAllBtn");

  $("year").textContent = new Date().getFullYear();

  // ---------- Seletores de formato/qualidade ----------
  for (const [key, fmt] of Object.entries(FORMATS)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = fmt.label;
    formatSelect.appendChild(opt);
  }
  formatSelect.value = "mp3";

  function refreshQualityOptions() {
    const fmt = FORMATS[formatSelect.value];
    qualitySelect.innerHTML = "";
    if (!fmt.qualities) {
      qualityGroup.hidden = true;
      return;
    }
    qualityGroup.hidden = false;
    for (const q of fmt.qualities) {
      const opt = document.createElement("option");
      opt.value = q.value;
      opt.textContent = q.label;
      qualitySelect.appendChild(opt);
    }
    qualitySelect.value = fmt.defaultQuality;
  }
  formatSelect.addEventListener("change", refreshQualityOptions);
  refreshQualityOptions();

  // ---------- Entrada de arquivos ----------
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  });

  ["dragover", "dragenter"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

  function addFiles(fileListInput) {
    for (const file of fileListInput) {
      items.push({ id: nextId++, file, status: "pendente" });
    }
    render();
  }

  clearBtn.addEventListener("click", () => {
    if (converting) return;
    items = [];
    render();
  });

  // ---------- Renderização ----------
  function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB";
    return bytes + " B";
  }

  function baseName(name) {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(0, i) : name;
  }

  function render() {
    optionsBox.hidden = items.length === 0;
    fileList.innerHTML = "";
    for (const item of items) {
      const li = document.createElement("li");
      li.className = "file-item";
      item.el = li;

      const name = document.createElement("div");
      name.className = "file-name";
      name.textContent = item.file.name;

      const actions = document.createElement("div");
      actions.className = "file-actions";

      const status = document.createElement("span");
      status.className = "file-status";
      status.textContent = item.status;
      if (item.status === "concluído") status.classList.add("status-done");
      if (item.status.startsWith("erro")) status.classList.add("status-error");
      actions.appendChild(status);

      if (item.result) {
        const a = document.createElement("a");
        a.className = "btn btn-success btn-small";
        a.textContent = "⬇ Baixar " + item.result.name.split(".").pop().toUpperCase();
        a.href = URL.createObjectURL(item.result.blob);
        a.download = item.result.name;
        actions.appendChild(a);
      }

      if (!converting) {
        const rm = document.createElement("button");
        rm.className = "btn-remove";
        rm.title = "Remover da lista";
        rm.textContent = "✕";
        rm.addEventListener("click", () => {
          items = items.filter((x) => x.id !== item.id);
          render();
        });
        actions.appendChild(rm);
      }

      const meta = document.createElement("div");
      meta.className = "file-meta";
      meta.textContent = formatSize(item.file.size);

      const track = document.createElement("div");
      track.className = "progress-track";
      const bar = document.createElement("div");
      bar.className = "progress-bar";
      track.appendChild(bar);
      item.bar = bar;

      li.append(name, actions, meta, track);
      fileList.appendChild(li);
    }
    downloadAllWrap.hidden = items.filter((x) => x.result).length < 2;
  }

  // ---------- Motor (ffmpeg.wasm) ----------
  async function getFFmpeg() {
    if (ffmpeg) return ffmpeg;
    engineStatus.hidden = false;
    engineStatus.textContent =
      "Carregando o motor de conversão (~32 MB, apenas na primeira vez)…";
    const instance = new FFmpeg();
    await instance.load({
      coreURL: new URL("vendor/ffmpeg/ffmpeg-core.js", location.href).href,
      wasmURL: new URL("vendor/ffmpeg/ffmpeg-core.wasm", location.href).href,
    });
    engineStatus.hidden = true;
    ffmpeg = instance;
    return ffmpeg;
  }

  // ---------- Conversão ----------
  convertBtn.addEventListener("click", async () => {
    if (converting || items.length === 0) return;
    converting = true;
    convertBtn.disabled = true;
    clearBtn.disabled = true;
    formatSelect.disabled = true;
    qualitySelect.disabled = true;

    const fmt = FORMATS[formatSelect.value];
    const quality = fmt.qualities ? qualitySelect.value : null;

    try {
      const ff = await getFFmpeg();

      for (const item of items) {
        if (item.result) continue; // já convertido
        item.status = "convertendo…";
        render();
        item.el.classList.add("converting");
        item.el.querySelector(".file-status").classList.add("status-working");

        const onProgress = ({ progress }) => {
          const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
          item.bar.style.width = pct + "%";
        };
        ff.on("progress", onProgress);

        try {
          const inputName = "in_" + item.id;
          const outputName = "out_" + item.id + "." + fmt.ext;

          await ff.writeFile(inputName, await fetchFile(item.file));
          const code = await ff.exec([
            "-i", inputName,
            "-vn", // descarta vídeo/capa embutida
            ...fmt.args(quality),
            outputName,
          ]);
          if (code !== 0) throw new Error("ffmpeg retornou código " + code);

          const data = await ff.readFile(outputName);
          if (!data || data.length === 0) throw new Error("saída vazia");

          item.result = {
            blob: new Blob([data.buffer], { type: fmt.mime }),
            name: baseName(item.file.name) + "." + fmt.ext,
          };
          item.status = "concluído";

          await ff.deleteFile(inputName).catch(() => {});
          await ff.deleteFile(outputName).catch(() => {});
        } catch (err) {
          console.error("Falha ao converter", item.file.name, err);
          item.status = "erro na conversão";
        } finally {
          ff.off("progress", onProgress);
        }
        render();
      }
    } catch (err) {
      console.error("Falha ao carregar o ffmpeg.wasm", err);
      engineStatus.hidden = false;
      engineStatus.textContent =
        "Não foi possível carregar o motor de conversão. Verifique sua conexão e recarregue a página.";
    } finally {
      converting = false;
      convertBtn.disabled = false;
      clearBtn.disabled = false;
      formatSelect.disabled = false;
      qualitySelect.disabled = false;
      render();
    }
  });

  // ---------- Baixar todos ----------
  downloadAllBtn.addEventListener("click", () => {
    for (const item of items) {
      if (!item.result) continue;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(item.result.blob);
      a.download = item.result.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  });
})();
