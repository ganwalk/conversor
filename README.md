# 🎵 ConversorAudio — conversor de áudio grátis no navegador

Site estático que converte arquivos de áudio (MP3, WAV, FLAC, OGG, OPUS, M4A, AIFF — e extrai áudio de vídeos MP4/MPEG/WEBM) **100% no navegador do usuário**, usando [FFmpeg](https://ffmpeg.org) compilado para WebAssembly ([ffmpeg.wasm](https://ffmpegwasm.netlify.app/)).

**Por que isso é importante para o seu modelo de negócio:** como a conversão roda no computador do visitante, você **não paga servidor de processamento nem banda de upload** — o site inteiro é estático e pode ser hospedado de graça. Toda a receita de anúncios é lucro.

## Estrutura do projeto

```
index.html        → página principal (conversor + conteúdo/FAQ + espaços de anúncio)
app.js            → lógica de conversão (fila, progresso, download)
style.css         → visual do site
privacidade.html  → política de privacidade (obrigatória para o AdSense)
termos.html       → termos de uso
vendor/ffmpeg/    → FFmpeg.wasm hospedado junto com o site (sem depender de CDN)
.github/workflows/deploy.yml → publica automaticamente no GitHub Pages
```

## Como rodar localmente

Não há build — é só servir os arquivos:

```bash
# qualquer servidor estático funciona; com Python:
python3 -m http.server 8080
# abra http://localhost:8080
```

> Abrir o `index.html` direto com dois cliques (file://) **não funciona** — workers e WebAssembly exigem um servidor HTTP.

## Como publicar de graça (GitHub Pages)

1. Faça o merge desta branch na `main`.
2. No GitHub, vá em **Settings → Pages → Build and deployment** e escolha **Source: GitHub Actions**.
3. Pronto — o workflow `deploy.yml` publica o site a cada push na `main`, em `https://SEU_USUARIO.github.io/conversor/`.

Alternativas igualmente gratuitas: Cloudflare Pages (recomendado quando o tráfego crescer — banda ilimitada) ou Netlify.

## Passo a passo para monetizar (o que VOCÊ precisa fazer)

1. **Compre um domínio próprio** (ex.: `conversoraudio.com.br`, ~R$ 40/ano no Registro.br). O AdSense raramente aprova sites em subdomínio `github.io`, então isso é praticamente obrigatório.
2. **Aponte o domínio para a hospedagem** (GitHub Pages ou Cloudflare Pages têm guias para domínio próprio; no GitHub: Settings → Pages → Custom domain).
3. **Cadastre-se no [Google AdSense](https://adsense.google.com)** com o site já no ar. A aprovação leva de dias a semanas e exige conteúdo próprio (a FAQ e as páginas de privacidade/termos já ajudam nisso).
4. **Cole os códigos do AdSense** nos lugares marcados:
   - O script principal vai no `<head>` do `index.html` — procure o comentário `GOOGLE ADSENSE — passo 1`.
   - Os blocos de anúncio vão nas três `div.ad-slot` (topo, meio e rodapé) — cada uma tem um comentário indicando onde colar.
5. **Cadastre o site no [Google Search Console](https://search.google.com/search-console)** e envie o sitemap para começar a aparecer nas buscas — é de onde virá a maior parte do tráfego.

### Dicas para crescer o tráfego

- Crie páginas dedicadas por conversão (ex.: `/mp3-para-wav`, `/wav-para-mp3`) reutilizando o mesmo conversor — páginas específicas ranqueiam muito melhor no Google para buscas como "converter mp3 para wav".
- Não exagere nos anúncios no começo: o AdSense reprova sites com mais anúncio do que conteúdo.
- Considere adicionar mais ferramentas depois (cortar áudio, mudar volume, extrair áudio de vídeo como página própria) — o FFmpeg já embarcado faz tudo isso.

## Formatos suportados

| Saída | Codec | Qualidades |
|---|---|---|
| MP3 | libmp3lame | 128–320 kbps |
| M4A | AAC | 128–256 kbps |
| OGG | Vorbis | q3–q7 |
| OPUS | libopus | 64–192 kbps |
| FLAC | flac | sem perdas |
| WAV | PCM 16-bit | sem compressão |
| AIFF | PCM 16-bit | sem compressão |

Na **entrada**, o FFmpeg detecta automaticamente praticamente qualquer formato de áudio ou vídeo (MP3, WAV, FLAC, OGG, OPUS, M4A/AAC, WMA, AMR, MP4, MPEG, WEBM, MKV…).

## Licenças

O site usa [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) (MIT) e o núcleo FFmpeg (LGPL/GPL). Os binários em `vendor/ffmpeg/` são distribuídos conforme essas licenças.
